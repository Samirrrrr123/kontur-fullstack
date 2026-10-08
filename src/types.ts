export type Topic = 'technology' | 'design' | 'games' | 'internet'
export type Kind = 'article' | 'news'
export type User = { id: string; name: string; email: string }
export type Post = { id: string; title: string; excerpt: string; content: string; topic: Topic; kind: Kind; publishedAt: string; authorId: string; author: { id: string; name: string }; likesCount: number; commentsCount: number; liked: boolean }
export type Comment = { id: string; text: string; createdAt: string; author: { id: string; name: string } }
export const topics: Record<Topic, string> = { technology: 'Технологии', design: 'Дизайн', games: 'Игры', internet: 'Интернет' }
