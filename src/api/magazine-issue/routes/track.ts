export default {
  routes: [
    {
      method: 'POST',
      path: '/magazine-issues/:documentId/track',
      handler: 'track.track',
      config: {
        auth: {
          scope: ['api::magazine-issue.track.track'],
        },
        policies: [],
        middlewares: [],
      },
    },
  ],
};
