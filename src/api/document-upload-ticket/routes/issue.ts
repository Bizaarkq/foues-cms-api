export default {
  routes: [
    {
      method: 'POST',
      path: '/documents/upload-tickets',
      handler: 'issue.issue',
      config: {
        auth: {
          scope: ['api::document-upload-ticket.issue.issue'],
        },
        policies: [],
        middlewares: [],
      },
    },
  ],
};
