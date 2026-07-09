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
        this.apiLoad(changedProps.url);
      }
    }

    // Senkron GET: script tarafina cagri aninda deger dondurebilmek icin.
    // Ayni SAC origin'inde oturum cookie'leri otomatik gider (auth gerekmez).
    apiLoad(url) {
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

    apiGetCount() { return this._rows.length; }
    apiGetHttpStatus() { return this._http; }
    apiGetRaw() { return this._raw; }

    apiGetValue(field, index) {
      const i = index || 0;
      return this._rows[i] ? this._field(this._rows[i], field) : "";
    }

    apiGetValues(field) {
      return this._rows.map(r => this._field(r, field));
    }

    apiGetValuesCsv(field) {
      return this.apiGetValues(field).join(",");
    }

    // "f1=v1;f2=v2;..." seklinde istenen sayida kosul; bos string = filtre yok
    _applyFilters(filters) {
      const conds = String(filters || "")
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map(s => {
          const i = s.indexOf("=");
          return { f: s.substring(0, i).trim(), v: s.substring(i + 1).trim() };
        });
      return this._rows.filter(r => conds.every(c => this._field(r, c.f) === c.v));
    }

    apiGetValuesFiltered(field, filters) {
      return this._applyFilters(filters).map(r => this._field(r, field));
    }

    apiGetValuesFilteredCsv(field, filters) {
      return this.apiGetValuesFiltered(field, filters).join(",");
    }

    apiGetValueOfMaxFiltered(returnField, orderField, filters) {
      return this._maxRow(this._applyFilters(filters), orderField, returnField);
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
