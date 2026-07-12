export default {
  routes: [
    {
      method: 'POST',
      path: '/site-users/track-login',
      handler: 'track-login.trackLogin',
      config: {
        auth: {
          scope: ['api::site-user.track-login.trackLogin'],
        },
        policies: [],
        middlewares: [],
      },
    },
  ],
};
