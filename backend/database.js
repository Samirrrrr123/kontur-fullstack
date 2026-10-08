import 'reflect-metadata'
import { DataSource, EntitySchema } from 'typeorm'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const id = { type: String, primary: true, length: 36 }
const createdAt = { type: Date, createDate: true }
export const User = new EntitySchema({ name: 'User', tableName: 'users', columns: { id, email: { type: String, unique: true }, name: { type: String }, passwordHash: { type: String }, createdAt } })
export const Post = new EntitySchema({ name: 'Post', tableName: 'posts', columns: { id, title: { type: String }, excerpt: { type: String }, content: { type: 'text' }, topic: { type: String }, kind: { type: String }, publishedAt: { type: Date }, updatedAt: { type: Date, updateDate: true }, authorId: { type: String } }, relations: { author: { type: 'many-to-one', target: 'User', joinColumn: { name: 'authorId' }, onDelete: 'CASCADE' } } })
export const Comment = new EntitySchema({ name: 'Comment', tableName: 'comments', columns: { id, text: { type: 'text' }, createdAt, postId: { type: String }, authorId: { type: String } }, relations: { post: { type: 'many-to-one', target: 'Post', joinColumn: { name: 'postId' }, onDelete: 'CASCADE' }, author: { type: 'many-to-one', target: 'User', joinColumn: { name: 'authorId' }, onDelete: 'CASCADE' } } })
export const Like = new EntitySchema({ name: 'Like', tableName: 'likes', columns: { id, postId: { type: String }, userId: { type: String } }, uniques: [{ columns: ['postId', 'userId'] }], relations: { post: { type: 'many-to-one', target: 'Post', joinColumn: { name: 'postId' }, onDelete: 'CASCADE' }, user: { type: 'many-to-one', target: 'User', joinColumn: { name: 'userId' }, onDelete: 'CASCADE' } } })
class KonturDataSource extends DataSource {
  async initialize() {
    await super.initialize()
    if (this.options.type === 'sqljs') await this.query('PRAGMA foreign_keys = ON')
    return this
  }
}
export function createDatabase() {
  const location = resolve(process.env.DB_FILE || 'data/kontur.sqlite')
  if (!process.env.DATABASE_URL) mkdirSync(resolve(location, '..'), { recursive: true })
  const source = new KonturDataSource({ ...(process.env.DATABASE_URL ? { type: 'postgres', url: process.env.DATABASE_URL } : {
    type: 'sqljs', location, autoSave: true,
    autoSaveCallback: data => {
      writeFileSync(location, Buffer.from(data))
      source.driver.databaseConnection.exec('PRAGMA foreign_keys = ON')
    }
  }), entities: [User, Post, Comment, Like], synchronize: true, logging: false })
  return source
}
