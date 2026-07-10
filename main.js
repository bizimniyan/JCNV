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

    // Senkron istekler: script tarafina cagri aninda deger dondurebilmek icin.
    // Ayni SAC origin'inde oturum cookie'leri otomatik gider (auth gerekmez).
    load(url) {
      return this._request("GET", url, null);
    }

    // POST: CSRF token'i icerde otomatik alinir (GET /api/v1/csrf, ayni session).
    post(url, body) {
      return this._request("POST", url, body || "{}");
    }

    _csrf(url) {
      try {
        const origin = url.split("/").slice(0, 3).join("/");
        const xhr = new XMLHttpRequest();
        xhr.open("GET", origin + "/api/v1/csrf", false);
        xhr.setRequestHeader("x-csrf-token", "Fetch");
        xhr.send(null);
        return xhr.getResponseHeader("x-csrf-token") || "";
      } catch (e) {
        return "";
      }
    }

    _request(method, url, body) {
      this.url = url;
      let ok = false;
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, false);
        xhr.setRequestHeader("Accept", "application/json");
        if (method !== "GET") {
          xhr.setRequestHeader("Content-Type", "application/json");
          const tok = this._csrf(url);
          if (tok) xhr.setRequestHeader("x-csrf-token", tok);
        }
        xhr.send(body);
        this._http = xhr.status;
        ok = this._consume(xhr.responseText || "");
      } catch (e) {
        this._rows = [];
        this._raw = String(e);
        this._http = this._http || 0;
        ok = false;
      }
      this._render(ok);
      return ok;
    }

    // Yaniti parse edip satirlari hafizaya alir; basari = HTTP 2xx + JSON parse
    _consume(text) {
      this._raw = text;
      try {
        const parsed = JSON.parse(this._raw || "{}");
        if (Array.isArray(parsed)) this._rows = parsed;
        else if (parsed && Array.isArray(parsed.value)) this._rows = parsed.value; // OData govdesi
        else if (parsed && typeof parsed === "object") this._rows = [parsed];
        else this._rows = [];
        return this._http >= 200 && this._http < 300;
      } catch (e) {
        this._rows = [];
        this._raw = "JSON degil: " + String(this._raw).substring(0, 150);
        return false;
      }
    }

    // Cross-origin (orn. Datasphere) icin: cookie'li ASYNC GET.
    // Bitince "onLoaded" event'i tetiklenir — script'in devami o event'e yazilir.
    loadAsync(url) {
      this.url = url;
      const self = this;
      fetch(url, { credentials: "include", headers: { "Accept": "application/json" } })
        .then(function (res) { self._http = res.status; return res.text(); })
        .then(function (txt) {
          self._render(self._consume(txt));
          self.dispatchEvent(new Event("onLoaded"));
        })
        .catch(function (err) {
          self._http = 0;
          self._rows = [];
          self._raw = String(err);
          self._render(false);
          self.dispatchEvent(new Event("onLoaded"));
        });
    }

    // "a.b.c" seklinde ic ice alan okuma (ham deger — sayi sayi kalir)
    _fieldRaw(row, path) {
      let v = row;
      const parts = String(path).split(".");
      for (let i = 0; i < parts.length && v !== null && v !== undefined; i++) v = v[parts[i]];
      return v === null || v === undefined ? null : v;
    }

    _field(row, path) {
      const v = this._fieldRaw(row, path);
      return v === null ? "" : String(v);
    }

    // Yuklu satirlari SAC Data Import body'sine cevirir: {"Data":[{...}]} (string doner).
    // mapSpec: "Hedef=KaynakAlan;Hedef2=Kaynak2;Sabit='deger';..."
    //   - sag taraf tek tirnakliysa sabit deger, degilse satirdan okunur (a.b.c olur)
    //   - kaynak degeri null/bos ise "#" yazilir; sayilar sayi olarak kalir
    toImportBody(mapSpec) {
      return this.toImportBodyRange(mapSpec, 0, 0);
    }

    // from: 0 tabanli baslangic, count: satir sayisi (0 = hepsi) — buyuk veri icin parcalama
    // mapSpec "*" ile baslarsa (veya bos ise) TUM alanlar aynen kopyalanir;
    // "*"dan sonraki girisler uzerine yazar: "*;ZPARAMETRE='STS0013';Date=DONEM"
    toImportBodyRange(mapSpec, from, count) {
      const entries = String(mapSpec || "")
        .split(";")
        .map(s => s.trim())
        .filter(s => s.length > 0);
      const copyAll = entries.length === 0 || entries[0] === "*";
      const maps = entries
        .filter(s => s !== "*")
        .map(s => {
          const i = s.indexOf("=");
          return { t: s.substring(0, i).trim(), s: s.substring(i + 1).trim() };
        });
      const start = from || 0;
      const end = count > 0 ? Math.min(start + count, this._rows.length) : this._rows.length;

      // Kolon tipi tespiti: herhangi bir satirda sayi gorulen kolon SAYISALDIR
      // -> null/bos deger sayisal kolonda 0, digerlerinde "#" olur
      const numericCols = {};
      for (let r = 0; r < this._rows.length; r++) {
        for (const k in this._rows[r]) {
          if (typeof this._rows[r][k] === "number") numericCols[k] = true;
        }
      }
      const fill = (col, v) =>
        (v === null || v === undefined || v === "") ? (numericCols[col] ? 0 : "#") : v;

      const out = [];
      for (let r = start; r < end; r++) {
        const row = this._rows[r];
        const o = {};
        if (copyAll) {
          for (const k in row) o[k] = fill(k, row[k]);
        }
        for (let m = 0; m < maps.length; m++) {
          const src = maps[m].s;
          if (src.length > 1 && src.charAt(0) === "'" && src.charAt(src.length - 1) === "'") {
            o[maps[m].t] = src.substring(1, src.length - 1);
          } else {
            o[maps[m].t] = fill(src, this._fieldRaw(row, src));
          }
        }
        out.push(o);
      }
      return JSON.stringify({ Data: out });
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

    getValuesFiltered(field, filters) {
      return this._applyFilters(filters).map(r => this._field(r, field));
    }

    getValuesFilteredCsv(field, filters) {
      return this.getValuesFiltered(field, filters).join(",");
    }

    getValueOfMaxFiltered(returnField, orderField, filters) {
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
