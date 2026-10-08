import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { User, Post, Comment, Like } from './database.js'

export function createApp(db, secret) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim()) }))
  app.use(express.json({ limit: '256kb' }))
  const users = db.getRepository(User), posts = db.getRepository(Post), comments = db.getRepository(Comment), likes = db.getRepository(Like)
  const auth = (req, res, next) => {
    try {
      const header = req.headers.authorization || ''
      if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Войдите в аккаунт' })
      req.userId = jwt.verify(header.slice(7), secret, { algorithms: ['HS256'] }).sub
      if (typeof req.userId !== 'string') return res.status(401).json({ message: 'Недействительный токен' })
      next()
    } catch { res.status(401).json({ message: 'Сессия истекла. Войдите снова' }) }
  }
  const optionalAuth = (req, res, next) => req.headers.authorization ? auth(req, res, next) : next()
  const profile = user => ({ id: user.id, name: user.name, email: user.email })
  const session = user => ({ user: profile(user), token: jwt.sign({}, secret, { subject: user.id, expiresIn: '12h', algorithm: 'HS256' }) })
  const postSchema = z.object({ title: z.string().trim().min(3, 'Заголовок: минимум 3 символа').max(150), excerpt: z.string().trim().max(280).default(''), content: z.string().trim().min(20, 'Текст: минимум 20 символов').max(30000), topic: z.enum(['technology', 'design', 'games', 'internet']), kind: z.enum(['article', 'news']) }).strict()
  const commentSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict()
  const present = async (post, userId) => ({ ...post, author: { id: post.author.id, name: post.author.name }, likesCount: await likes.countBy({ postId: post.id }), commentsCount: await comments.countBy({ postId: post.id }), liked: !!userId && await likes.existsBy({ postId: post.id, userId }) })
  const findPost = id => posts.findOne({ where: { id }, relations: { author: true } })
  const owned = async (req, res) => {
    const post = await findPost(req.params.id)
    if (!post) { res.status(404).json({ message: 'Публикация не найдена' }); return null }
    if (post.authorId !== req.userId) { res.status(403).json({ message: 'Можно изменять только свои публикации' }); return null }
    return post
  }
  app.get('/api/health', (req, res) => res.json({ status: 'ok', database: db.options.type === 'postgres' ? 'PostgreSQL' : 'SQLite' }))
  app.post('/api/auth/register', async (req, res) => {
    const data = z.object({ name: z.string().trim().min(2).max(60), email: z.string().trim().email().max(150).transform(x => x.toLowerCase()), password: z.string().min(8).max(72) }).strict().parse(req.body)
    if (await users.existsBy({ email: data.email })) return res.status(409).json({ message: 'Этот email уже зарегистрирован' })
    const user = await users.save({ id: randomUUID(), name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 10) })
    res.status(201).json(session(user))
  })
  app.post('/api/auth/login', async (req, res) => {
    const data = z.object({ email: z.string().trim().email().transform(x => x.toLowerCase()), password: z.string().min(1).max(72) }).strict().parse(req.body)
    const user = await users.findOneBy({ email: data.email })
    if (!user || !await bcrypt.compare(data.password, user.passwordHash)) return res.status(401).json({ message: 'Неверный email или пароль' })
    res.json(session(user))
  })
  app.get('/api/auth/me', auth, async (req, res) => {
    const user = await users.findOneBy({ id: req.userId })
    if (!user) return res.status(401).json({ message: 'Аккаунт не найден' })
    res.json(profile(user))
  })
  app.get('/api/posts/mine', auth, async (req, res) => {
    const result = await posts.find({ where: { authorId: req.userId }, relations: { author: true }, order: { publishedAt: 'DESC' } })
    res.json(await Promise.all(result.map(x => present(x, req.userId))))
  })
  app.get('/api/posts', optionalAuth, async (req, res) => {
    const filters = z.object({ topic: z.enum(['technology','design','games','internet']).optional(), kind: z.enum(['article','news']).optional() }).parse(req.query)
    const result = await posts.find({ where: filters, relations: { author: true }, order: { publishedAt: 'DESC' } })
    res.json(await Promise.all(result.map(x => present(x, req.userId))))
  })
  app.get('/api/posts/popular', optionalAuth, async (req, res) => {
    const result = await posts.find({ relations: { author: true }, order: { publishedAt: 'DESC' } })
    const publications = await Promise.all(result.map(post => present(post, req.userId)))
    res.json(publications.filter(post => post.likesCount > 0).sort((a, b) => b.likesCount - a.likesCount || new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 3))
  })
  app.get('/api/posts/:id', optionalAuth, async (req, res) => {
    const post = await findPost(req.params.id)
    if (!post) return res.status(404).json({ message: 'Публикация не найдена' })
    res.json(await present(post, req.userId))
  })
  app.post('/api/posts', auth, async (req, res) => {
    const data = postSchema.parse(req.body)
    const post = await posts.save({ ...data, excerpt: data.excerpt || data.content.slice(0, 180), id: randomUUID(), authorId: req.userId, publishedAt: new Date() })
    res.status(201).json(await present(await findPost(post.id), req.userId))
  })
  app.patch('/api/posts/:id', auth, async (req, res) => {
    const post = await owned(req, res)
    if (!post) return
    const data = postSchema.parse(req.body)
    await posts.update(post.id, { ...data, excerpt: data.excerpt || data.content.slice(0, 180) })
    res.json(await present(await findPost(post.id), req.userId))
  })
  app.delete('/api/posts/:id', auth, async (req, res) => {
    if (!await owned(req, res)) return
    await db.transaction(async manager => {
      await manager.getRepository(Comment).delete({ postId: req.params.id })
      await manager.getRepository(Like).delete({ postId: req.params.id })
      await manager.getRepository(Post).delete(req.params.id)
    })
    res.status(204).end()
  })
  app.get('/api/posts/:id/comments', async (req, res) => {
    if (!await posts.existsBy({ id: req.params.id })) return res.status(404).json({ message: 'Публикация не найдена' })
    const result = await comments.find({ where: { postId: req.params.id }, relations: { author: true }, order: { createdAt: 'ASC' } })
    res.json(result.map(x => ({ id: x.id, text: x.text, createdAt: x.createdAt, author: { id: x.author.id, name: x.author.name } })))
  })
  app.post('/api/posts/:id/comments', auth, async (req, res) => {
    const data = commentSchema.parse(req.body)
    if (!await posts.existsBy({ id: req.params.id })) return res.status(404).json({ message: 'Публикация не найдена' })
    const comment = await comments.save({ ...data, id: randomUUID(), postId: req.params.id, authorId: req.userId })
    const author = await users.findOneBy({ id: req.userId })
    res.status(201).json({ id: comment.id, text: comment.text, createdAt: comment.createdAt, author: { id: author.id, name: author.name } })
  })
  app.delete('/api/comments/:id', auth, async (req, res) => {
    const comment = await comments.findOneBy({ id: req.params.id })
    if (!comment) return res.status(404).json({ message: 'Комментарий не найден' })
    if (comment.authorId !== req.userId) return res.status(403).json({ message: 'Можно удалить только свой комментарий' })
    await comments.delete(comment.id)
    res.status(204).end()
  })
  app.put('/api/posts/:id/like', auth, async (req, res) => {
    if (!await posts.existsBy({ id: req.params.id })) return res.status(404).json({ message: 'Публикация не найдена' })
    await likes.upsert({ id: randomUUID(), postId: req.params.id, userId: req.userId }, ['postId', 'userId'])
    res.json({ liked: true, likesCount: await likes.countBy({ postId: req.params.id }) })
  })
  app.delete('/api/posts/:id/like', auth, async (req, res) => {
    if (!await posts.existsBy({ id: req.params.id })) return res.status(404).json({ message: 'Публикация не найдена' })
    await likes.delete({ postId: req.params.id, userId: req.userId })
    res.json({ liked: false, likesCount: await likes.countBy({ postId: req.params.id }) })
  })
  app.use('/api', (req, res) => res.status(404).json({ message: 'Маршрут API не найден' }))
  const dist = resolve('dist')
  if (existsSync(dist)) {
    app.use(express.static(dist))
    app.get('/{*path}', (req, res) => res.sendFile(resolve(dist, 'index.html')))
  }
  app.use((error, req, res, next) => {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message })
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Слишком большой запрос' })
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ message: 'Некорректный JSON' })
    if (error.code === '23505' || /UNIQUE constraint/.test(error.message)) return res.status(409).json({ message: 'Такая запись уже существует' })
    console.error(error)
    res.status(500).json({ message: 'Ошибка сервера. Попробуйте ещё раз' })
  })
  return app
}
