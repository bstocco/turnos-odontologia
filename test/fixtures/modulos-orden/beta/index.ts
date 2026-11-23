import type { FastifyPluginAsync } from 'fastify';

const plugin: FastifyPluginAsync = async (app) => {
  app.get('/beta', async () => ({ modulo: 'beta' }));
};

export default plugin;
