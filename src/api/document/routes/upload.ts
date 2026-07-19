export default {
  routes: [
    {
      method: 'POST',
      // PUBLIC on purpose, not an oversight: the ticket in the URL IS the
      // credential (opaque 128-bit random string, single-use, 10-minute
      // TTL, bound to a specific category+title+uploader identity at
      // issuance time by api::document-upload-ticket.issue.issue). The
      // browser now calls this route directly — there is no Next.js hop in
      // the middle anymore to hold a Bearer token — so requiring API-token
      // auth here would be both impossible for the real client and useless
      // as a security boundary. See docs/document-repository.md → "Site
      // uploads" for the full trust-model writeup.
      path: '/documents/upload/:ticket',
      handler: 'upload.upload',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
