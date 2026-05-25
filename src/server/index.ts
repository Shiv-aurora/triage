import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './api';
import { menu } from './menu';
import { scheduler } from './scheduler';
import { triggers } from './triggers';

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/scheduler', scheduler);
internal.route('/triggers', triggers);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
