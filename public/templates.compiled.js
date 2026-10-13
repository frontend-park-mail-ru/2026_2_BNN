(function () {
  Handlebars.templates = Handlebars.templates || {};
  Handlebars.partials = Handlebars.partials || {};
  Handlebars.templates["login"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<main class=\"login-layout login-page\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"glass-filter"),depth0,{"name":"glass-filter","data":data,"indent":"    ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "    <section class=\"ios-glass-panel\">\r\n        <div class=\"auth-brand\">\r\n            <div class=\"auth-brand-title\">\r\n                <div class=\"logo\" aria-hidden=\"true\"></div>\r\n                <h1>Brand New Notes</h1>\r\n            </div>\r\n            <p class=\"auth-tagline\">Ваши заметки и мысли – в уютном месте</p>\r\n        </div>\r\n        <form class=\"login-form\" data-form-type=\"login\" novalidate>\r\n            <label class=\"field\" for=\"login-username\">\r\n                <span class=\"field-label\">Логин</span>\r\n                <input id=\"login-username\" name=\"login\" type=\"text\" placeholder=\" \">\r\n                <small class=\"field-error\" data-error-for=\"login\"></small>\r\n            </label>\r\n            <label class=\"field\" for=\"login-password\">\r\n                <span class=\"field-label\">Пароль</span>\r\n                <input id=\"login-password\" name=\"password\" type=\"password\" placeholder=\" \">\r\n                <small class=\"field-error\" data-error-for=\"password\"></small>\r\n            </label>\r\n            <button class=\"login-button\" type=\"submit\">\r\n                <span class=\"login-button-label\">Войти</span>\r\n                <span class=\"login-button-spinner\" aria-hidden=\"true\"></span>\r\n            </button>\r\n            <p class=\"form-feedback\"></p>\r\n            <p class=\"hint\">Нет аккаунта? <a href=\"/signup\" data-link>Зарегистрироваться</a></p>\r\n        </form>\r\n    </section>\r\n</main>\r\n";
},"usePartial":true,"useData":true});
  Handlebars.templates["notes"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<div class=\"notes-page\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"header"),depth0,{"name":"header","data":data,"indent":"    ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "    <div class=\"layout\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"sidebar"),depth0,{"name":"sidebar","data":data,"indent":"        ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "        <main class=\"notes-main\" data-notes-main>\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"notes-main"),depth0,{"name":"notes-main","data":data,"indent":"            ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "        </main>\r\n    </div>\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"logout-dialog"),depth0,{"name":"logout-dialog","data":data,"indent":"    ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "</div>\r\n";
},"usePartial":true,"useData":true});
  Handlebars.templates["notfound"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<main class=\"not-found\">\n  <h1>"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"title","hash":{},"data":data,"loc":{"start":{"line":2,"column":6},"end":{"line":2,"column":15}}}) : helper)))
    + "</h1>\n  <p>Такой страницы нет.</p>\n  <a href=\"/\" data-link>На главную</a>\n</main>";
},"useData":true});
  Handlebars.templates["signup"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<main class=\"login-layout login-page register-page\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"glass-filter"),depth0,{"name":"glass-filter","data":data,"indent":"    ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "    <section class=\"ios-glass-panel\">\r\n        <div class=\"auth-brand\">\r\n            <div class=\"auth-brand-title\">\r\n                <div class=\"logo\" aria-hidden=\"true\"></div>\r\n                <h1>Brand New Notes</h1>\r\n            </div>\r\n            <p class=\"auth-tagline\">Ваши заметки и мысли – в уютном месте</p>\r\n        </div>\r\n        <form class=\"login-form register-form\" data-form-type=\"register\" novalidate>\r\n            <label class=\"field\" for=\"reg-login\">\r\n                <span class=\"field-label\">Логин</span>\r\n                <input id=\"reg-login\" name=\"login\" type=\"text\" placeholder=\" \">\r\n                <small class=\"field-error\" data-error-for=\"login\"></small>\r\n            </label>\r\n            <label class=\"field\" for=\"reg-password\">\r\n                <span class=\"field-label\">Пароль</span>\r\n                <input id=\"reg-password\" name=\"password\" type=\"password\" placeholder=\" \">\r\n                <small class=\"field-error\" data-error-for=\"password\"></small>\r\n            </label>\r\n            <label class=\"field\" for=\"reg-password-repeat\">\r\n                <span class=\"field-label\">Повторите пароль</span>\r\n                <input id=\"reg-password-repeat\" name=\"repeatPassword\" type=\"password\" placeholder=\" \">\r\n                <small class=\"field-error\" data-error-for=\"repeatPassword\"></small>\r\n            </label>\r\n            <button class=\"login-button\" type=\"submit\">\r\n                <span class=\"login-button-label\">Зарегистрироваться</span>\r\n                <span class=\"login-button-spinner\" aria-hidden=\"true\"></span>\r\n            </button>\r\n            <p class=\"form-feedback\"></p>\r\n            <p class=\"hint\">Уже есть аккаунт? <a href=\"/login\" data-link>Войти</a></p>\r\n        </form>\r\n    </section>\r\n</main>\r\n";
},"usePartial":true,"useData":true});
  Handlebars.partials["glass-filter"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<svg class=\"glass-filter\" aria-hidden=\"true\" focusable=\"false\">\n  <filter\n    id=\"liquid-glass\"\n    x=\"0\"\n    y=\"0\"\n    width=\"100%\"\n    height=\"100%\"\n    color-interpolation-filters=\"sRGB\"\n  >\n    <feImage\n      href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='r' x1='0' x2='1' y1='0' y2='0'%3E%3Cstop offset='0' stop-color='%23f00'/%3E%3Cstop offset='1' stop-color='%23000'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='0' x2='0' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%2300f'/%3E%3Cstop offset='1' stop-color='%23000'/%3E%3C/linearGradient%3E%3Cfilter id='s'%3E%3CfeGaussianBlur stdDeviation='3'/%3E%3C/filter%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23r)'/%3E%3Crect width='100' height='100' fill='url(%23b)' style='mix-blend-mode:screen'/%3E%3Crect x='9' y='7' width='82' height='86' rx='12' fill='%23808080' filter='url(%23s)'/%3E%3C/svg%3E\"\n      x=\"0\"\n      y=\"0\"\n      width=\"100%\"\n      height=\"100%\"\n      preserveAspectRatio=\"none\"\n      result=\"map\"\n    />\n    <feDisplacementMap\n      in=\"SourceGraphic\"\n      in2=\"map\"\n      scale=\"50\"\n      xChannelSelector=\"R\"\n      yChannelSelector=\"B\"\n    />\n  </filter>\n</svg>";
},"useData":true});
  Handlebars.partials["header"] = Handlebars.template({"0":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return container.escapeExpression(((helper = (helper = lookupProperty(helpers,"userLogin") || (depth0 != null ? lookupProperty(depth0,"userLogin") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"userLogin","hash":{},"data":data,"loc":{"start":{"line":21,"column":105},"end":{"line":21,"column":118}}}) : helper)));
},"1":function(container,depth0,helpers,partials,data) {
    return "Профиль";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<header class=\"header-block\">\r\n    <a href=\"/\" class=\"logo\" aria-label=\"На главную\" data-link>\r\n        <img src=\"/assets/icons/logo-shape.svg\" alt=\"Brand New Notes\">\r\n    </a>\r\n    <search class=\"search-box\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"search"},"data":data,"indent":"        ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "        <input class=\"search-field\" type=\"search\" placeholder=\"Поиск по заметкам\" aria-label=\"Поиск по заметкам\" data-search>\r\n        <button class=\"search-clear\" type=\"button\" aria-label=\"Очистить поиск\" data-search-clear>\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"close"},"data":data,"indent":"            ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "        </button>\r\n        <div class=\"search-results\" data-search-results hidden></div>\r\n    </search>\r\n    <div class=\"header-actions\">\r\n        <button class=\"new-note-button\" type=\"button\">+ Новая заметка</button>\r\n        <div class=\"user-menu\">\r\n            <button class=\"avatar\" type=\"button\" aria-label=\"Меню пользователя\" aria-haspopup=\"true\">\r\n                <img src=\"/assets/images/avatar-default.svg\" alt=\"\">\r\n            </button>\r\n            <div class=\"user-menu-panel\">\r\n                <div class=\"user-menu-card\" role=\"menu\">\r\n                    <a class=\"user-menu-item\" href=\"/profile\" role=\"menuitem\" data-link>"
    + ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"userLogin") : depth0),{"name":"if","hash":{},"fn":container.program(0, data, 0),"inverse":container.program(1, data, 0),"data":data,"loc":{"start":{"line":21,"column":88},"end":{"line":21,"column":140}}})) != null ? stack1 : "")
    + "</a>\r\n                    <a class=\"user-menu-item\" href=\"/settings\" role=\"menuitem\" data-link>Настройки</a>\r\n                    <button class=\"user-menu-item is-danger\" type=\"button\" role=\"menuitem\" data-logout-open>Выйти</button>\r\n                </div>\r\n            </div>\r\n        </div>\r\n    </div>\r\n</header>\r\n";
},"usePartial":true,"useData":true});
  Handlebars.partials["icon"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<svg class=\"icon\">\n  <use href=\"/assets/icons/ui/sprite.svg#"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"name") || (depth0 != null ? lookupProperty(depth0,"name") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"name","hash":{},"data":data,"loc":{"start":{"line":2,"column":41},"end":{"line":2,"column":49}}}) : helper)))
    + "\"></use>\n</svg>";
},"useData":true});
  Handlebars.partials["logout-dialog"] = Handlebars.template({"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"modal\" data-logout-dialog hidden>\n  <div class=\"modal-card\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"logout-title\">\n    <h2 id=\"logout-title\">Выйти из аккаунта?</h2>\n    <p>Вам потребуется повторная авторизация.</p>\n    <div class=\"modal-actions\">\n      <button class=\"modal-button is-ghost\" type=\"button\" data-logout-cancel>Отмена</button>\n      <button class=\"modal-button\" type=\"button\" data-logout>Выйти</button>\n    </div>\n  </div>\n</div>";
},"useData":true});
  Handlebars.partials["notebook"] = Handlebars.template({"0":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "                    <li>\r\n                        <a href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"href") || (depth0 != null ? lookupProperty(depth0,"href") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"href","hash":{},"data":data,"loc":{"start":{"line":7,"column":33},"end":{"line":7,"column":41}}}) : helper)))
    + "\" data-link>"
    + alias4(((helper = (helper = lookupProperty(helpers,"label") || (depth0 != null ? lookupProperty(depth0,"label") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"label","hash":{},"data":data,"loc":{"start":{"line":7,"column":53},"end":{"line":7,"column":62}}}) : helper)))
    + "</a>\r\n                    </li>\r\n";
},"1":function(container,depth0,helpers,partials,data) {
    var helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<li>"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"title","hash":{},"data":data,"loc":{"start":{"line":10,"column":33},"end":{"line":10,"column":42}}}) : helper)))
    + "</li>";
},"2":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<h1 class=\"note-title\" contenteditable=\"true\" data-note-title>\r\n            "
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"title","hash":{},"data":data,"loc":{"start":{"line":27,"column":12},"end":{"line":27,"column":21}}}) : helper)))
    + "\r\n        </h1>\r\n        <div class=\"note-body\" contenteditable=\"true\" data-note-body>\r\n            "
    + ((stack1 = lookupProperty(helpers,"each").call(alias1,(depth0 != null ? lookupProperty(depth0,"paragraphs") : depth0),{"name":"each","hash":{},"fn":container.program(3, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":30,"column":12},"end":{"line":30,"column":56}}})) != null ? stack1 : "")
    + "\r\n        </div>\r\n";
},"3":function(container,depth0,helpers,partials,data) {
    return "<p>"
    + container.escapeExpression(container.lambda(depth0, depth0))
    + "</p>";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, alias1=depth0 != null ? depth0 : (container.nullContext || {}), lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<article class=\"notebook\">\r\n    <div class=\"notebook-toolbar\">\r\n        <nav>\r\n            <ol class=\"breadcrumbs\">\r\n"
    + ((stack1 = lookupProperty(helpers,"each").call(alias1,(depth0 != null ? lookupProperty(depth0,"breadcrumbs") : depth0),{"name":"each","hash":{},"fn":container.program(0, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":5,"column":16},"end":{"line":9,"column":25}}})) != null ? stack1 : "")
    + "                "
    + ((stack1 = lookupProperty(helpers,"if").call(alias1,(depth0 != null ? lookupProperty(depth0,"title") : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":10,"column":16},"end":{"line":10,"column":54}}})) != null ? stack1 : "")
    + "\r\n            </ol>\r\n        </nav>\r\n        <div class=\"notebook-actions\">\r\n            <button class=\"icon-button\" type=\"button\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"heart"},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "            </button>\r\n            <button class=\"icon-button\" type=\"button\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"share"},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "            </button>\r\n            <button class=\"icon-button\" type=\"button\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"menu"},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "            </button>\r\n        </div>\r\n    </div>\r\n    <div class=\"note-content\">\r\n        "
    + ((stack1 = lookupProperty(helpers,"if").call(alias1,(depth0 != null ? lookupProperty(depth0,"title") : depth0),{"name":"if","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":26,"column":8},"end":{"line":32,"column":15}}})) != null ? stack1 : "")
    + "    </div>\r\n</article>\r\n";
},"usePartial":true,"useData":true});
  Handlebars.partials["notecard"] = Handlebars.template({"0":function(container,depth0,helpers,partials,data) {
    return " is-active";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<a href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"href") || (depth0 != null ? lookupProperty(depth0,"href") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"href","hash":{},"data":data,"loc":{"start":{"line":1,"column":9},"end":{"line":1,"column":17}}}) : helper)))
    + "\" class=\"card"
    + ((stack1 = lookupProperty(helpers,"if").call(alias1,(depth0 != null ? lookupProperty(depth0,"isActive") : depth0),{"name":"if","hash":{},"fn":container.program(0, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":1,"column":30},"end":{"line":1,"column":63}}})) != null ? stack1 : "")
    + "\" title=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"title","hash":{},"data":data,"loc":{"start":{"line":1,"column":72},"end":{"line":1,"column":81}}}) : helper)))
    + "\" data-link>\r\n    <h3>"
    + alias4(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"title","hash":{},"data":data,"loc":{"start":{"line":2,"column":8},"end":{"line":2,"column":17}}}) : helper)))
    + "</h3>\r\n</a>\r\n";
},"useData":true});
  Handlebars.partials["notes-list"] = Handlebars.template({"0":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "    <ul class=\"list-of-notes\" aria-busy=\"true\" aria-label=\"Загрузка заметок\">\r\n"
    + ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"skeletonRows") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":3,"column":8},"end":{"line":5,"column":17}}})) != null ? stack1 : "")
    + "    </ul>\r\n";
},"1":function(container,depth0,helpers,partials,data) {
    return "            <li class=\"card\"><span class=\"skeleton skeleton-line\"></span></li>\r\n";
},"2":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"isError") : depth0),{"name":"if","hash":{},"fn":container.program(3, data, 0),"inverse":container.program(4, data, 0),"data":data,"loc":{"start":{"line":7,"column":0},"end":{"line":15,"column":0}}})) != null ? stack1 : "");
},"3":function(container,depth0,helpers,partials,data) {
    return "    <p class=\"library-message is-error\">Не удалось загрузить список</p>\r\n";
},"4":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "    <ul class=\"list-of-notes\">\r\n"
    + ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"notes") : depth0),{"name":"each","hash":{},"fn":container.program(5, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":11,"column":8},"end":{"line":13,"column":17}}})) != null ? stack1 : "")
    + "    </ul>\r\n";
},"5":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "            <li>"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"notecard"),depth0,{"name":"notecard","data":data,"helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "</li>\r\n";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"isLoading") : depth0),{"name":"if","hash":{},"fn":container.program(0, data, 0),"inverse":container.program(2, data, 0),"data":data,"loc":{"start":{"line":1,"column":0},"end":{"line":15,"column":7}}})) != null ? stack1 : "");
},"usePartial":true,"useData":true});
  Handlebars.partials["notes-main"] = Handlebars.template({"0":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "    <article class=\"notebook\" aria-busy=\"true\">\r\n        <div class=\"notebook-toolbar\">\r\n            <span class=\"skeleton skeleton-line skeleton-crumbs\"></span>\r\n            <div class=\"notebook-actions is-disabled\">\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"heart"},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"share"},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"menu"},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "            </div>\r\n        </div>\r\n        <div class=\"note-content\">\r\n"
    + ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"skeletonRows") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":12,"column":12},"end":{"line":14,"column":21}}})) != null ? stack1 : "")
    + "        </div>\r\n    </article>\r\n";
},"1":function(container,depth0,helpers,partials,data) {
    return "                <span class=\"skeleton skeleton-line\"></span>\r\n";
},"2":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"isError") : depth0),{"name":"if","hash":{},"fn":container.program(3, data, 0),"inverse":container.program(4, data, 0),"data":data,"loc":{"start":{"line":17,"column":0},"end":{"line":46,"column":0}}})) != null ? stack1 : "");
},"3":function(container,depth0,helpers,partials,data) {
    var stack1, helper, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "    <article class=\"notebook notebook-state\">\r\n        <div class=\"state-message\">\r\n            <span class=\"state-icon is-error\">"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"alert"},"data":data,"helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "</span>\r\n            <h2>Не удалось загрузить заметки</h2>\r\n            <p>"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"errorMessage") || (depth0 != null ? lookupProperty(depth0,"errorMessage") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"errorMessage","hash":{},"data":data,"loc":{"start":{"line":22,"column":15},"end":{"line":22,"column":31}}}) : helper)))
    + "</p>\r\n            <button class=\"state-button is-secondary\" type=\"button\" data-retry>Повторить</button>\r\n        </div>\r\n    </article>\r\n";
},"4":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"isEmpty") : depth0),{"name":"if","hash":{},"fn":container.program(5, data, 0),"inverse":container.program(6, data, 0),"data":data,"loc":{"start":{"line":26,"column":0},"end":{"line":46,"column":0}}})) != null ? stack1 : "");
},"5":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "    <article class=\"notebook notebook-state\">\r\n        <div class=\"state-message\">\r\n            <span class=\"state-icon\">"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"file"},"data":data,"helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "</span>\r\n            <h2>У вас пока нет заметок</h2>\r\n            <p>Создайте первую заметку, и она появится здесь</p>\r\n            <button class=\"state-button\" type=\"button\">Создать заметку</button>\r\n        </div>\r\n    </article>\r\n";
},"6":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"isWelcome") : depth0),{"name":"if","hash":{},"fn":container.program(7, data, 0),"inverse":container.program(8, data, 0),"data":data,"loc":{"start":{"line":35,"column":0},"end":{"line":46,"column":0}}})) != null ? stack1 : "");
},"7":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "    <article class=\"notebook notebook-state\">\r\n        <div class=\"state-message\">\r\n            <span class=\"state-icon\">"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"file"},"data":data,"helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "</span>\r\n            <h2>Добро пожаловать</h2>\r\n            <p>Выберите заметку<br>или создайте новую</p>\r\n            <button class=\"state-button\" type=\"button\">Создать заметку</button>\r\n        </div>\r\n    </article>\r\n";
},"8":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = container.invokePartial(lookupProperty(partials,"notebook"),depth0,{"name":"notebook","data":data,"indent":"    ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "");
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"isLoading") : depth0),{"name":"if","hash":{},"fn":container.program(0, data, 0),"inverse":container.program(2, data, 0),"data":data,"loc":{"start":{"line":1,"column":0},"end":{"line":46,"column":7}}})) != null ? stack1 : "");
},"usePartial":true,"useData":true});
  Handlebars.partials["search-results"] = Handlebars.template({"0":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "  <ul class=\"search-results-list\">\n"
    + ((stack1 = lookupProperty(helpers,"each").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"results") : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":3,"column":4},"end":{"line":9,"column":13}}})) != null ? stack1 : "")
    + "  </ul>\n";
},"1":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "      <li>\n        <a class=\"search-result\" href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"href") || (depth0 != null ? lookupProperty(depth0,"href") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"href","hash":{},"data":data,"loc":{"start":{"line":5,"column":39},"end":{"line":5,"column":47}}}) : helper)))
    + "\" data-link>\n          <span class=\"search-result-title\">"
    + alias4(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"title","hash":{},"data":data,"loc":{"start":{"line":6,"column":44},"end":{"line":6,"column":53}}}) : helper)))
    + "</span>\n        </a>\n      </li>\n";
},"2":function(container,depth0,helpers,partials,data) {
    return "  <p class=\"search-result-empty\">Ничего не найдено</p>\n";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return ((stack1 = lookupProperty(helpers,"if").call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? lookupProperty(depth0,"hasResults") : depth0),{"name":"if","hash":{},"fn":container.program(0, data, 0),"inverse":container.program(2, data, 0),"data":data,"loc":{"start":{"line":1,"column":0},"end":{"line":13,"column":7}}})) != null ? stack1 : "");
},"useData":true});
  Handlebars.partials["sidebar"] = Handlebars.template({"0":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "            <a\r\n                href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"href") || (depth0 != null ? lookupProperty(depth0,"href") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"href","hash":{},"data":data,"loc":{"start":{"line":5,"column":22},"end":{"line":5,"column":30}}}) : helper)))
    + "\"\r\n                class=\"icon-button"
    + ((stack1 = lookupProperty(helpers,"if").call(alias1,(depth0 != null ? lookupProperty(depth0,"isActive") : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":6,"column":34},"end":{"line":6,"column":67}}})) != null ? stack1 : "")
    + ((stack1 = lookupProperty(helpers,"unless").call(alias1,(data && lookupProperty(data,"first")),{"name":"unless","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":6,"column":67},"end":{"line":6,"column":108}}})) != null ? stack1 : "")
    + "\"\r\n                aria-label=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"title","hash":{},"data":data,"loc":{"start":{"line":7,"column":28},"end":{"line":7,"column":37}}}) : helper)))
    + "\"\r\n                "
    + ((stack1 = lookupProperty(helpers,"if").call(alias1,(data && lookupProperty(data,"first")),{"name":"if","hash":{},"fn":container.program(3, data, 0),"inverse":container.program(4, data, 0),"data":data,"loc":{"start":{"line":8,"column":16},"end":{"line":8,"column":88}}})) != null ? stack1 : "")
    + "\r\n            >\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":(depth0 != null ? lookupProperty(depth0,"icon") : depth0)},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "            </a>\r\n";
},"1":function(container,depth0,helpers,partials,data) {
    return " is-active";
},"2":function(container,depth0,helpers,partials,data) {
    return " is-disabled";
},"3":function(container,depth0,helpers,partials,data) {
    return "data-link";
},"4":function(container,depth0,helpers,partials,data) {
    return "aria-disabled=\"true\" tabindex=\"-1\"";
},"5":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=container.hooks.helperMissing, alias3="function", alias4=container.escapeExpression, lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "                <a\r\n                    href=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"href") || (depth0 != null ? lookupProperty(depth0,"href") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"href","hash":{},"data":data,"loc":{"start":{"line":16,"column":26},"end":{"line":16,"column":34}}}) : helper)))
    + "\"\r\n                    class=\"icon-button"
    + ((stack1 = lookupProperty(helpers,"if").call(alias1,(depth0 != null ? lookupProperty(depth0,"isActive") : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":17,"column":38},"end":{"line":17,"column":71}}})) != null ? stack1 : "")
    + " is-disabled\"\r\n                    aria-label=\""
    + alias4(((helper = (helper = lookupProperty(helpers,"title") || (depth0 != null ? lookupProperty(depth0,"title") : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"title","hash":{},"data":data,"loc":{"start":{"line":18,"column":32},"end":{"line":18,"column":41}}}) : helper)))
    + "\"\r\n                    aria-disabled=\"true\"\r\n                    tabindex=\"-1\"\r\n                >\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":(depth0 != null ? lookupProperty(depth0,"icon") : depth0)},"data":data,"indent":"                    ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "                </a>\r\n";
},"compiler":[8,">= 4.3.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), lookupProperty = container.lookupProperty || function(parent, propertyName) {
        if (Object.prototype.hasOwnProperty.call(parent, propertyName)) {
          return parent[propertyName];
        }
        return undefined
    };

  return "<div class=\"sidebar\">\r\n    <nav class=\"navigation\">\r\n"
    + ((stack1 = lookupProperty(helpers,"each").call(alias1,(depth0 != null ? lookupProperty(depth0,"sections") : depth0),{"name":"each","hash":{},"fn":container.program(0, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":3,"column":8},"end":{"line":12,"column":17}}})) != null ? stack1 : "")
    + "        <div class=\"navigation-bottom\">\r\n"
    + ((stack1 = lookupProperty(helpers,"with").call(alias1,(depth0 != null ? lookupProperty(depth0,"mailSection") : depth0),{"name":"with","hash":{},"fn":container.program(5, data, 0),"inverse":container.noop,"data":data,"loc":{"start":{"line":14,"column":12},"end":{"line":24,"column":21}}})) != null ? stack1 : "")
    + "            <button\r\n                class=\"icon-button theme-toggle is-disabled\"\r\n                type=\"button\"\r\n                aria-label=\"Сменить тему\"\r\n                data-theme-toggle\r\n                disabled\r\n            >\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"icon"),depth0,{"name":"icon","hash":{"name":"sunset"},"data":data,"indent":"                ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "            </button>\r\n        </div>\r\n    </nav>\r\n    <section class=\"library\">\r\n        <h2 class=\"library-title\">"
    + container.escapeExpression(((helper = (helper = lookupProperty(helpers,"sectionTitle") || (depth0 != null ? lookupProperty(depth0,"sectionTitle") : depth0)) != null ? helper : container.hooks.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"sectionTitle","hash":{},"data":data,"loc":{"start":{"line":37,"column":34},"end":{"line":37,"column":50}}}) : helper)))
    + "</h2>\r\n        <div class=\"library-body\" data-notes-list>\r\n"
    + ((stack1 = container.invokePartial(lookupProperty(partials,"notes-list"),depth0,{"name":"notes-list","data":data,"indent":"            ","helpers":helpers,"partials":partials,"decorators":container.decorators})) != null ? stack1 : "")
    + "        </div>\r\n    </section>\r\n</div>\r\n";
},"usePartial":true,"useData":true});
})();
