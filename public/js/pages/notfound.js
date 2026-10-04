export const NotFoundPage = {
  async render() {
    const template = Handlebars.templates["notfound"];
    return template({ title: "404" });
  },

  mount(_root) {},

  destroy() {},
};
