import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from '../utils/validation.js';
import { success, error } from '../utils/response.js';

const notifications = new Hono();

const subscribeSchema = z.object({
  user_type: z.enum(['parent', 'teacher']),
  user_id: z.coerce.number().int().positive(),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    })
  })
});

// Subscribe to push notifications
notifications.post('/subscribe', validate(subscribeSchema), async (c) => {
  const DB = c.env.DB;
  const data = c.req.valid('json');
  const { user_type, user_id, subscription } = data;

  // Check if subscription already exists
  const existing = await DB.prepare(
    'SELECT id FROM push_subscriptions WHERE endpoint = ?'
  ).bind(subscription.endpoint).first();

  if (existing) {
    // Update existing subscription
    await DB.prepare(
      'UPDATE push_subscriptions SET user_type = ?, user_id = ?, p256dh = ?, auth = ? WHERE id = ?'
    ).bind(user_type, user_id, subscription.keys.p256dh, subscription.keys.auth, existing.id).run();
  } else {
    // Insert new subscription
    await DB.prepare(
      'INSERT INTO push_subscriptions (user_type, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)'
    ).bind(user_type, user_id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth).run();
  }

  return c.json(success({ message: 'Subscribed successfully' }));
});

// Get notification history
notifications.get('/history', async (c) => {
  const DB = c.env.DB;
  const userType = c.req.query('user_type');
  const userId = c.req.query('user_id');

  if (!userType || !userId) {
    return c.json(error('BAD_REQUEST', 'Missing user_type or user_id'), 400);
  }

  const results = await DB.prepare(
    'SELECT * FROM notification_history WHERE user_type = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(userType, parseInt(userId)).all();

  return c.json(success(results.results || []));
});

// Mark notification as read
notifications.patch('/:id/read', async (c) => {
  const DB = c.env.DB;
  const id = c.req.param('id');

  await DB.prepare(
    'UPDATE notification_history SET is_read = 1 WHERE id = ?'
  ).bind(id).run();

  return c.json(success({ message: 'Marked as read' }));
});

export default notifications;
