(function () {
  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      .form { font: 13px Arial, sans-serif; padding: 8px; }
      .form label { display: block; margin: 8px 0 3px; font-weight: bold; }
      .form input { width: 100%; box-sizing: border-box; padding: 5px; }
      .form button { margin-top: 10px; padding: 6px 14px; }
    </style>
    <div class="form">
      <label for="url">API URL (GET)</label>
      <input id="url" type="text" placeholder="https://.../api/v1/dataimport/jobs">
      <button id="apply">Uygula</button>
    </div>`;

  class ApiValueReaderBuilder extends HTMLElement {
    constructor() {
      super();
      this._shadowRoot = this.attachShadow({ mode: "open" });
      this._shadowRoot.appendChild(template.content.cloneNode(true));
      this._shadowRoot.getElementById("apply").addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("propertiesChanged", {
          detail: { properties: { url: this._shadowRoot.getElementById("url").value } }
        }));
      });
    }

    onCustomWidgetAfterUpdate(changedProps) {
      if ("url" in changedProps) {
        this._shadowRoot.getElementById("url").value = changedProps.url || "";
      }
    }
  }

  customElements.define("custom-api-value-builder", ApiValueReaderBuilder);
})();
