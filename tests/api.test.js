import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDatabase, User, Like } from '../backend/database.js'
import { createApp } from '../backend/app.js'

const secret = 'test-secret-only-for-temporary-test-database'
test('API: auth, CRUD, ownership, filters, likes, comments, CORS and persistence', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'kontur-test-'))
  const previousFile = process.env.DB_FILE, previousURL = process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  process.env.DB_FILE = join(folder, 'test.sqlite')
  const db = createDatabase()
  await db.initialize()
  const server = createApp(db, secret).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (path, method = 'GET', body, token, origin) => {
    const response = await fetch(base + '/api' + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, headers: response.headers, data: response.status === 204 ? null : await response.json() }
  }
  let alice, bob, post, comment
  const content = { title: 'Тестовая статья', excerpt: 'Короткое описание', content: 'Это полноценный текст статьи для проверки работы API и базы данных.', topic: 'design', kind: 'article' }
  try {
    await t.test('protected requests reject missing, malformed and forged tokens', async () => {
      assert.equal((await request('/posts/mine')).status, 401)
      assert.equal((await request('/posts', 'POST', content)).status, 401)
      assert.equal((await request('/posts/mine', 'GET', undefined, 'invalid')).status, 401)
    })
    await t.test('registration, password hashing, duplicate account and login', async () => {
      let result = await request('/auth/register', 'POST', { name: 'Алиса', email: 'alice@example.com', password: 'Password2026!' })
      assert.equal(result.status, 201); alice = result.data
      result = await request('/auth/register', 'POST', { name: 'Борис', email: 'bob@example.com', password: 'Password2026!' })
      assert.equal(result.status, 201); bob = result.data
      assert.equal((await request('/auth/register', 'POST', { name: 'Алиса', email: 'alice@example.com', password: 'Password2026!' })).status, 409)
      assert.equal((await request('/auth/login', 'POST', { email: 'alice@example.com', password: 'wrong' })).status, 401)
      assert.equal((await request('/auth/login', 'POST', { email: 'alice@example.com', password: 'Password2026!' })).status, 200)
      assert.match((await db.getRepository(User).findOneBy({ id: alice.user.id })).passwordHash, /^\$2/)
      assert.equal((await request('/auth/me', 'GET', undefined, alice.token)).data.name, 'Алиса')
    })
    await t.test('public listing, creation, detail and server filters', async () => {
      assert.equal((await request('/posts')).status, 200)
      const created = await request('/posts', 'POST', content, alice.token)
      assert.equal(created.status, 201); post = created.data
      assert.equal(post.author.name, 'Алиса'); assert.equal('passwordHash' in post.author, false)
      assert.equal((await request(`/posts/${post.id}`)).data.title, content.title)
      assert.equal((await request('/posts?topic=design')).data.length, 1)
      assert.equal((await request('/posts?topic=games')).data.length, 0)
      assert.equal((await request('/posts?kind=news')).data.length, 0)
      assert.equal((await request('/posts?topic=bad')).status, 400)
    })
    await t.test('only the owner can edit and delete; own list is isolated', async () => {
      assert.equal((await request(`/posts/${post.id}`, 'PATCH', content, bob.token)).status, 403)
      assert.equal((await request(`/posts/${post.id}`, 'DELETE', undefined, bob.token)).status, 403)
      assert.equal((await request('/posts/mine', 'GET', undefined, bob.token)).data.length, 0)
      assert.equal((await request('/posts/mine', 'GET', undefined, alice.token)).data.length, 1)
      assert.equal((await request(`/posts/${post.id}`, 'PATCH', { ...content, title: 'Новый заголовок' }, alice.token)).status, 200)
      assert.equal((await request(`/posts/${post.id}`)).data.title, 'Новый заголовок')
      assert.equal((await request('/posts', 'POST', { ...content, authorId: bob.user.id }, alice.token)).status, 400)
    })
    await t.test('like requests are idempotent and support unlike', async () => {
      assert.equal((await request(`/posts/${post.id}/like`, 'PUT', undefined)).status, 401)
      await Promise.all(Array.from({ length: 4 }, () => request(`/posts/${post.id}/like`, 'PUT', undefined, bob.token)))
      assert.equal(await db.getRepository(Like).countBy({ postId: post.id }), 1)
      assert.equal((await request(`/posts/${post.id}`, 'GET', undefined, bob.token)).data.liked, true)
      assert.equal((await request(`/posts/${post.id}/like`, 'DELETE', undefined, bob.token)).data.likesCount, 0)
      assert.equal((await request(`/posts/${post.id}/like`, 'DELETE', undefined, bob.token)).data.likesCount, 0)
      await request(`/posts/${post.id}/like`, 'PUT', undefined, bob.token)
    })
    await t.test('popular publications are public and ranked by actual likes', async () => {
      const popular = await request('/posts/popular')
      assert.equal(popular.status, 200)
      assert.equal(popular.data[0].id, post.id)
      assert.equal(popular.data[0].likesCount, 1)
    })
    await t.test('comments are public to read and protected to create or delete', async () => {
      assert.equal((await request(`/posts/${post.id}/comments`, 'POST', { text: 'Комментарий' })).status, 401)
      const result = await request(`/posts/${post.id}/comments`, 'POST', { text: 'Комментарий читателя' }, bob.token)
      assert.equal(result.status, 201); comment = result.data
      assert.equal((await request(`/posts/${post.id}/comments`)).data.length, 1)
      assert.equal((await request(`/comments/${comment.id}`, 'DELETE', undefined, alice.token)).status, 403)
      assert.equal((await request(`/comments/${comment.id}`, 'DELETE', undefined, bob.token)).status, 204)
      await request(`/posts/${post.id}/comments`, 'POST', { text: 'Ещё один комментарий' }, bob.token)
    })
    await t.test('CORS uses explicit origins', async () => {
      assert.equal((await request('/health', 'GET', undefined, undefined, 'http://localhost:3000')).headers.get('access-control-allow-origin'), 'http://localhost:3000')
      assert.equal((await request('/health', 'GET', undefined, undefined, 'https://untrusted.example')).headers.get('access-control-allow-origin'), null)
    })
    await t.test('data survives closing and reopening the database file', async () => {
      await db.destroy(); await db.initialize()
      const result = await request(`/posts/${post.id}`)
      assert.equal(result.status, 200); assert.equal(result.data.likesCount, 1); assert.equal(result.data.commentsCount, 1)
    })
    await t.test('foreign keys reject a reaction for a missing post', async () => {
      await assert.rejects(db.getRepository(Like).save({ id: 'missing-like', postId: 'missing-post', userId: bob.user.id }))
    })
    await t.test('delete cascades to related comments and likes', async () => {
      assert.equal((await request(`/posts/${post.id}`, 'DELETE', undefined, alice.token)).status, 204)
      assert.equal((await request(`/posts/${post.id}`)).status, 404)
      assert.equal(await db.getRepository(Like).countBy({ postId: post.id }), 0)
      assert.equal((await request(`/posts/${post.id}/comments`)).status, 404)
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
    if (db.isInitialized) await db.destroy()
    if (previousFile === undefined) delete process.env.DB_FILE; else process.env.DB_FILE = previousFile
    if (previousURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousURL
    await rm(folder, { recursive: true, force: true })
  }
})
