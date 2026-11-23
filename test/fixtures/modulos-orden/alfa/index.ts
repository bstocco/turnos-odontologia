import type { FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app) => {
  app.get('/alfa', async () => ({ modulo: 'alfa' }));
};

export default plugin;
