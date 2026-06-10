export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    if (event.params.data.active == null) {
      event.params.data.active = true;
    }
  },
};
