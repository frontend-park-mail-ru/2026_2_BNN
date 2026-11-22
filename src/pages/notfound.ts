/**
 * SPA-страница 404.
 */
export class NotFoundPage {
  /**
   * Рендерит шаблон "страница не найдена".
   */
  async render(): Promise<string> {
    const template = Handlebars.templates["notfound"];
    return template({ title: "404" });
  }

  /**
   * Заглушка для контракта роутера.
   *
   * @param _root Корневой узел страницы.
   */
  mount(_root: ParentNode): void {}

  /**
   * Заглушка для контракта роутера.
   */
  destroy(): void {}
}
