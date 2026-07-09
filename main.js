(function () {
  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display: block; }
      .box { font: 12px/1.4 "72", Arial, sans-serif; color: #333; background: #f7f7f7;
             border: 1px solid #d9d9d9; border-radius: 4px; padding: 6px 8px;
             height: 100%; box-sizing: border-box; overflow: auto; }
      .ok { color: #107e3e; }
      .err { color: #bb0000; }
      .url { color: #666; word-break: break-all; margin-top: 2px; }
    </style>
    <div class="box">
      <div id="state">API Value Reader — URL bekleniyor</div>
      <div id="info" class="url"></div>
    </div>`;

  class ApiValueReader extends HTMLElement {
    constructor() {
      super();
      this._shadowRoot = this.attachShadow({ mode: "open" });
      this._shadowRoot.appendChild(template.content.cloneNode(true));
      this._rows = [];
      this._raw = "";
      this._http = 0;
      this.url = "";
    }

    onCustomWidgetAfterUpdate(changedProps) {
      if ("url" in changedProps && changedProps.url) {
        this.load(changedProps.url);
      }
    }

    // Senkron GET: script tarafina cagri aninda deger dondurebilmek icin.
    // Ayni SAC origin'inde oturum cookie'leri otomatik gider (auth gerekmez).
    load(url) {
      this.url = url;
      let ok = false;
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.setRequestHeader("Accept", "application/json");
        xhr.send(null);
        this._http = xhr.status;
        this._raw = xhr.responseText || "";
        const parsed = JSON.parse(this._raw);
        if (Array.isArray(parsed)) this._rows = parsed;
        else if (parsed && Array.isArray(parsed.value)) this._rows = parsed.value; // OData govdesi
        else if (parsed && typeof parsed === "object") this._rows = [parsed];
        else this._rows = [];
        ok = this._http >= 200 && this._http < 300;
      } catch (e) {
        this._rows = [];
        this._raw = String(e);
        this._http = this._http || 0;
        ok = false;
      }
      this._render(ok);
      return ok;
    }

    // "a.b.c" seklinde ic ice alan okuma
    _field(row, path) {
      let v = row;
      const parts = String(path).split(".");
      for (let i = 0; i < parts.length && v !== null && v !== undefined; i++) v = v[parts[i]];
      return v === null || v === undefined ? "" : String(v);
    }

    getCount() { return this._rows.length; }
    getHttpStatus() { return this._http; }
    getRaw() { return this._raw; }

    getValue(field, index) {
      const i = index || 0;
      return this._rows[i] ? this._field(this._rows[i], field) : "";
    }

    getValues(field) {
      return this._rows.map(r => this._field(r, field));
    }

    getValuesCsv(field) {
      return this.getValues(field).join(",");
    }

    getValuesWhere(field, filterField, filterValue) {
      return this._rows
        .filter(r => this._field(r, filterField) === String(filterValue))
        .map(r => this._field(r, field));
    }

    getValuesWhereCsv(field, filterField, filterValue) {
      return this.getValuesWhere(field, filterField, filterValue).join(",");
    }

    getValueOfMax(returnField, orderField) {
      return this._maxRow(this._rows, orderField, returnField);
    }

    getValueOfMaxWhere(returnField, orderField, filterField, filterValue) {
      const rows = this._rows.filter(r => this._field(r, filterField) === String(filterValue));
      return this._maxRow(rows, orderField, returnField);
    }

    getValuesWhere2(field, f1, v1, f2, v2) {
      return this._rows
        .filter(r => this._field(r, f1) === String(v1) && this._field(r, f2) === String(v2))
        .map(r => this._field(r, field));
    }

    getValueOfMaxWhere2(returnField, orderField, f1, v1, f2, v2) {
      const rows = this._rows.filter(r =>
        this._field(r, f1) === String(v1) && this._field(r, f2) === String(v2));
      return this._maxRow(rows, orderField, returnField);
    }

    _maxRow(rows, orderField, returnField) {
      if (!rows.length) return "";
      let best = rows[0];
      for (let i = 1; i < rows.length; i++) {
        if (this._field(rows[i], orderField) > this._field(best, orderField)) best = rows[i];
      }
      return this._field(best, returnField);
    }

    _render(ok) {
      const state = this._shadowRoot.getElementById("state");
      const info = this._shadowRoot.getElementById("info");
      state.className = ok ? "ok" : "err";
      state.textContent = ok
        ? "HTTP " + this._http + " — " + this._rows.length + " satır"
        : "HATA — HTTP " + this._http + " " + (this._raw || "").substring(0, 200);
      info.textContent = this.url || "";
    }
  }

  customElements.define("custom-api-value", ApiValueReader);
})();
