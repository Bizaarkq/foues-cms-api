export default {
  routes: [
    {
      method: 'POST',
      path: '/documents/upload',
      handler: 'upload.upload',
      config: {
        auth: {
          scope: ['api::document.upload.upload'],
        },
        policies: [],
        middlewares: [],
      },
    },
  ],
};
