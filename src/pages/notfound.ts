/**
 * SPA-страница 404.
 */
export class NotFoundPage {
  /**
   * Рендерит шаблон "страница не найдена".
   *
   * @returns {Promise<string>}
   */
  async render(): Promise<string> {
    const template = Handlebars.templates["notfound"];
    return template({ title: "404" });
  }

  /**
   * Заглушка для контракта роутера.
   *
   * @param {ParentNode} _root Корневой узел страницы.
   * @returns {void}
   */
  mount(_root: ParentNode): void {}

  /**
   * Заглушка для контракта роутера.
   *
   * @returns {void}
   */
  destroy(): void {}
}
