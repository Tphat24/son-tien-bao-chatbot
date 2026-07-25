(() => {
  'use strict';

  const script = document.currentScript;
  const scriptUrl = new URL(
    script?.src || window.location.href
  );

  const apiBase = (
    script?.dataset.apiBase ||
    scriptUrl.origin
  ).replace(/\/$/, '');

  const position =
    script?.dataset.position === 'left'
      ? 'left'
      : 'right';

  /*
   * Đổi phiên bản khóa lưu trữ để trình duyệt hiển thị
   * menu và giao diện mới, không lấy lịch sử giao diện cũ.
   */
  const STORAGE_SESSION =
    'stb_web_chat_session_id_v53';

  const STORAGE_MESSAGES =
    'stb_web_chat_messages_v53';

  const MAX_STORED_MESSAGES = 24;
  const MAX_VISIBLE_SOURCES = 3;

  const host = document.createElement('div');
  host.id = 'stb-ai-chatbot';
  document.body.appendChild(host);

  const root = host.attachShadow({
    mode: 'open'
  });

  const style = document.createElement('style');

  style.textContent = `
    :host {
      all: initial;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    button,
    input,
    textarea {
      font: inherit;
    }

    button,
    a {
      -webkit-tap-highlight-color: transparent;
    }

    .stb-wrap {
      position: fixed;
      ${position}: 18px;
      bottom: 18px;
      z-index: 2147483000;
      font-family:
        Inter,
        system-ui,
        -apple-system,
        "Segoe UI",
        Roboto,
        Arial,
        sans-serif;
      color: #17382c;
    }

    .stb-launch {
      position: relative;
      width: 58px;
      height: 58px;
      border: 0;
      border-radius: 18px;
      background:
        linear-gradient(
          145deg,
          #0d5b3d,
          #083c2a
        );
      box-shadow:
        0 12px 30px rgba(0, 0, 0, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #ffffff;
      transition:
        transform 0.18s ease,
        box-shadow 0.18s ease;
    }

    .stb-launch:hover {
      transform: translateY(-2px);
      box-shadow:
        0 15px 34px rgba(0, 0, 0, 0.29);
    }

    .stb-launch svg {
      width: 28px;
      height: 28px;
    }

    .stb-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 18px;
      height: 18px;
      background: #f3a000;
      border: 2px solid #ffffff;
      border-radius: 50%;
    }

    .stb-panel {
      position: absolute;
      ${position}: 0;
      bottom: 70px;
      width:
        min(
          382px,
          calc(100vw - 20px)
        );
      height:
        min(
          620px,
          calc(100vh - 94px)
        );
      background: #ffffff;
      border:
        1px solid rgba(13, 91, 61, 0.14);
      border-radius: 18px;
      box-shadow:
        0 24px 64px rgba(0, 0, 0, 0.24);
      overflow: hidden;
      display: none;
      grid-template-rows:
        auto
        auto
        1fr
        auto;
      transform-origin:
        bottom ${position};
      animation: stbOpen 0.18s ease;
    }

    .stb-panel.open {
      display: grid;
    }

    @keyframes stbOpen {
      from {
        opacity: 0;
        transform:
          translateY(10px)
          scale(0.985);
      }

      to {
        opacity: 1;
        transform: none;
      }
    }

    .stb-head {
      background:
        linear-gradient(
          120deg,
          #0d5b3d,
          #134d39
        );
      color: #ffffff;
      padding: 12px 13px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .stb-avatar {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: #ffffff;
      color: #0d5b3d;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 900;
      flex: none;
    }

    .stb-head-main {
      min-width: 0;
      flex: 1;
    }

    .stb-title {
      font-size: 14px;
      font-weight: 850;
      line-height: 1.25;
    }

    .stb-status {
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      opacity: 0.9;
    }

    .stb-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #76e6aa;
      box-shadow:
        0 0 0 3px
        rgba(118, 230, 170, 0.14);
    }

    .stb-close {
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: #ffffff;
      cursor: pointer;
      font-size: 22px;
      line-height: 1;
    }

    .stb-close:hover {
      background:
        rgba(255, 255, 255, 0.12);
    }

    /*
     * Zalo, điện thoại và email luôn hiển thị phía trên.
     */
    .stb-contact {
      display: grid;
      grid-template-columns:
        repeat(3, minmax(0, 1fr));
      gap: 6px;
      padding: 8px 10px;
      background: #ffffff;
      border-bottom: 1px solid #e8eeea;
    }

    .stb-contact a {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 0;
      min-height: 33px;
      padding: 0 6px;
      border-radius: 9px;
      text-decoration: none;
      font-size: 10.8px;
      font-weight: 800;
      white-space: nowrap;
      transition:
        transform 0.15s ease,
        background 0.15s ease;
    }

    .stb-contact a:hover {
      transform: translateY(-1px);
    }

    .stb-contact-zalo {
      background: #0068ff;
      color: #ffffff;
    }

    .stb-contact-call {
      background: #fff4dd;
      color: #8b5700;
      border: 1px solid #f3d69a;
    }

    .stb-contact-email {
      background: #eef4ff;
      color: #174a86;
      border: 1px solid #cfddf0;
    }

    .stb-body {
      background: #f4f7f5;
      overflow: auto;
      padding: 12px 11px 15px;
      scroll-behavior: smooth;
    }

    .stb-body::-webkit-scrollbar {
      width: 6px;
    }

    .stb-body::-webkit-scrollbar-thumb {
      background: #cad8d0;
      border-radius: 9px;
    }

    .stb-row {
      display: flex;
      align-items: flex-end;
      margin: 0 0 10px;
    }

    .stb-row.user {
      justify-content: flex-end;
    }

    .stb-bubble {
      max-width: 89%;
      padding: 10px 11px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.58;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .stb-row.bot .stb-bubble {
      background: #ffffff;
      border: 1px solid #e1e9e4;
      border-bottom-left-radius: 5px;
      box-shadow:
        0 2px 8px
        rgba(13, 91, 61, 0.04);
    }

    .stb-row.user .stb-bubble {
      background: #0d5b3d;
      color: #ffffff;
      border-bottom-right-radius: 5px;
      white-space: pre-wrap;
    }

    /*
     * Mỗi đoạn AI được tách thành một khối riêng.
     * Không thay đổi nội dung câu trả lời.
     */
    .stb-bubble-content {
      display: grid;
      gap: 9px;
      white-space: normal;
    }

    .stb-bubble-paragraph {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .stb-time {
      margin-top: 5px;
      font-size: 9.5px;
      color: #85948c;
    }

    .stb-row.user .stb-time {
      text-align: right;
      color: #d5e7dd;
    }

    /*
     * Sản phẩm và tài liệu liên quan.
     */
    .stb-sources {
      display: grid;
      gap: 6px;
      margin-top: 10px;
      padding-top: 9px;
      border-top: 1px solid #e8efeb;
    }

    .stb-sources-title {
      color: #315c48;
      font-size: 11px;
      font-weight: 850;
    }

    .stb-source {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0;
      padding: 7px 8px;
      border: 1px solid #dbe7e0;
      border-radius: 9px;
      background: #f7faf8;
      color: #0d5b3d;
      font-size: 11px;
      line-height: 1.35;
      text-decoration: none;
    }

    .stb-source::after {
      content: "↗";
      flex: none;
      font-size: 12px;
    }

    .stb-source:hover {
      background: #eef6f1;
      border-color: #bcd3c7;
    }

    /*
     * Menu lựa chọn ban đầu.
     */
    .stb-quick {
      display: grid;
      grid-template-columns:
        1fr 1fr;
      gap: 7px;
      margin: 3px 0 12px;
    }

    .stb-chip {
      min-height: 39px;
      padding: 8px 9px;
      border: 1px solid #cfe0d7;
      border-radius: 10px;
      background: #ffffff;
      color: #214b39;
      cursor: pointer;
      text-align: left;
      font-size: 11.5px;
      font-weight: 750;
      line-height: 1.35;
      transition:
        border-color 0.15s ease,
        background 0.15s ease;
    }

    .stb-chip:hover {
      border-color: #0d5b3d;
      background: #f2f8f4;
    }

    .stb-typing {
      display: inline-flex;
      gap: 4px;
      padding: 2px 1px;
    }

    .stb-typing i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #8ca096;
      animation:
        stbBounce 1s infinite ease-in-out;
    }

    .stb-typing i:nth-child(2) {
      animation-delay: 0.12s;
    }

    .stb-typing i:nth-child(3) {
      animation-delay: 0.24s;
    }

    @keyframes stbBounce {
      0%,
      60%,
      100% {
        transform: translateY(0);
        opacity: 0.5;
      }

      30% {
        transform: translateY(-4px);
        opacity: 1;
      }
    }

    /*
     * Form liên hệ mới: chỉ còn ba trường bắt buộc.
     */
    .stb-lead {
      margin: 2px 0 12px;
      padding: 13px;
      border: 1px solid #dce7e1;
      border-radius: 15px;
      background: #ffffff;
      box-shadow:
        0 5px 18px
        rgba(13, 91, 61, 0.06);
    }

    .stb-lead-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }

    .stb-lead-title {
      color: #153d2e;
      font-size: 14px;
      font-weight: 850;
    }

    .stb-lead-sub {
      max-width: 260px;
      margin-top: 3px;
      color: #708078;
      font-size: 10.5px;
      line-height: 1.45;
    }

    .stb-lead-badge {
      flex: none;
      padding: 5px 7px;
      border-radius: 999px;
      background: #eaf6ef;
      color: #0d5b3d;
      font-size: 9.5px;
      font-weight: 850;
    }

    .stb-form-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .stb-form-group {
      display: grid;
      gap: 5px;
    }

    .stb-label {
      color: #294c3d;
      font-size: 11.5px;
      font-weight: 800;
    }

    .stb-required {
      color: #d64545;
    }

    .stb-field {
      width: 100%;
      padding: 10px 11px;
      border: 1px solid #d8e2dc;
      border-radius: 10px;
      background: #fbfcfb;
      color: #17382c;
      outline: none;
      font-size: 13px;
    }

    .stb-field:focus {
      border-color: #0d5b3d;
      box-shadow:
        0 0 0 3px
        rgba(13, 91, 61, 0.08);
    }

    textarea.stb-field {
      min-height: 96px;
      resize: vertical;
    }

    .stb-field-help {
      color: #7b8b83;
      font-size: 10px;
      line-height: 1.4;
    }

    .stb-form-error {
      margin-top: 9px;
      padding: 8px 9px;
      border: 1px solid #f0b9b9;
      border-radius: 9px;
      background: #fff3f3;
      color: #a82d2d;
      font-size: 11px;
      line-height: 1.4;
    }

    .stb-form-error[hidden] {
      display: none;
    }

    .stb-contact-hint {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px 8px;
      margin-top: 10px;
      padding: 8px 9px;
      border-radius: 9px;
      background: #f5f8f6;
      color: #687970;
      font-size: 10.5px;
    }

    .stb-contact-hint a {
      color: #0d5b3d;
      font-weight: 800;
      text-decoration: none;
    }

    .stb-lead-actions {
      display: grid;
      grid-template-columns:
        1fr 1.5fr;
      gap: 7px;
      margin-top: 10px;
    }

    .stb-secondary,
    .stb-primary {
      padding: 9px 10px;
      border: 0;
      border-radius: 9px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 850;
    }

    .stb-secondary {
      background: #edf2ef;
      color: #355647;
    }

    .stb-primary {
      background: #0d5b3d;
      color: #ffffff;
    }

    .stb-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .stb-success-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      margin: 0 0 12px;
    }

    .stb-success-actions a {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 9px 10px;
      border-radius: 10px;
      text-decoration: none;
      font-size: 11.5px;
      font-weight: 850;
    }

    .stb-success-zalo {
      background: #0068ff;
      color: #ffffff;
    }

    .stb-success-call {
      background: #f3a000;
      color: #ffffff;
    }

    .stb-foot {
      padding: 9px 10px 8px;
      border-top: 1px solid #e3ebe6;
      background: #ffffff;
    }

    .stb-input-row {
      display: flex;
      align-items: flex-end;
      gap: 7px;
      padding: 5px 5px 5px 10px;
      border: 1px solid #dbe5df;
      border-radius: 12px;
      background: #f4f7f5;
    }

    .stb-textarea {
      flex: 1;
      min-width: 0;
      max-height: 90px;
      padding: 6px 0;
      border: 0;
      background: transparent;
      color: #17382c;
      outline: none;
      resize: none;
      font-size: 13px;
      line-height: 1.4;
    }

    .stb-textarea::placeholder {
      color: #8b9992;
    }

    .stb-send {
      width: 36px;
      height: 36px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 10px;
      background: #0d5b3d;
      color: #ffffff;
      cursor: pointer;
    }

    .stb-send:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .stb-send svg {
      width: 18px;
      height: 18px;
    }

    .stb-note {
      margin-top: 6px;
      color: #819088;
      text-align: center;
      font-size: 9.5px;
    }

    @media (max-width: 520px) {
      .stb-wrap {
        ${position}: 9px;
        bottom: 9px;
      }

      .stb-panel {
        position: fixed;
        left: 7px;
        right: 7px;
        bottom: 75px;
        width: auto;
        height:
          min(
            650px,
            calc(100vh - 86px)
          );
        border-radius: 17px;
      }

      .stb-launch {
        width: 56px;
        height: 56px;
        border-radius: 17px;
      }

      .stb-contact a {
        font-size: 10.4px;
      }

      .stb-lead {
        padding: 11px;
      }
    }
  `;

  root.appendChild(style);

  const wrap =
    document.createElement('div');

  wrap.className = 'stb-wrap';

  wrap.innerHTML = `
    <section
      class="stb-panel"
      aria-label="Chatbot tư vấn Sơn Tiến Bảo">

      <header class="stb-head">
        <div class="stb-avatar">STB</div>

        <div class="stb-head-main">
          <div class="stb-title">
            Trợ lý Sơn Tiến Bảo
          </div>

          <div class="stb-status">
            <span class="stb-dot"></span>
            Đang sẵn sàng tư vấn
          </div>
        </div>

        <button
          class="stb-close"
          type="button"
          aria-label="Đóng chatbot">
          ×
        </button>
      </header>

      <div class="stb-contact">
        <a
          class="stb-contact-zalo"
          data-director-zalo
          href="https://zalo.me/0913712195"
          target="_blank"
          rel="noopener noreferrer">
          💬 Zalo
        </a>

        <a
          class="stb-contact-call"
          data-director-call
          href="tel:0913712195">
          📞 Gọi
        </a>

        <a
          class="stb-contact-email"
          data-company-email
          href="mailto:ctytienbao@gmail.com">
          ✉️ Email
        </a>
      </div>

      <main
        class="stb-body"
        aria-live="polite">
      </main>

      <footer class="stb-foot">
        <div class="stb-input-row">
          <textarea
            class="stb-textarea"
            rows="1"
            maxlength="1200"
            placeholder="Nhập nhu cầu cần tư vấn...">
          </textarea>

          <button
            class="stb-send"
            type="button"
            aria-label="Gửi tin nhắn">

            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true">

              <path
                d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round">
              </path>
            </svg>
          </button>
        </div>

        <div class="stb-note">
          AI hỗ trợ sơ bộ • Giá bán và kỹ thuật
          được nhân viên xác nhận
        </div>
      </footer>
    </section>

    <button
      class="stb-launch"
      type="button"
      aria-label="Mở chatbot tư vấn">

      <span class="stb-badge"></span>

      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true">

        <path
          d="M20 11.5a8 8 0 0 1-8.5 8A8.7 8.7 0 0 1 8 18.8L3 20l1.3-4.1A8 8 0 1 1 20 11.5Z"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
        </path>

        <path
          d="M8 11h.01M12 11h.01M16 11h.01"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round">
        </path>
      </svg>
    </button>
  `;

  root.appendChild(wrap);

  const panel =
    wrap.querySelector('.stb-panel');

  const launch =
    wrap.querySelector('.stb-launch');

  const close =
    wrap.querySelector('.stb-close');

  const body =
    wrap.querySelector('.stb-body');

  const textarea =
    wrap.querySelector('.stb-textarea');

  const send =
    wrap.querySelector('.stb-send');

  const directorZaloLink =
    wrap.querySelector(
      '[data-director-zalo]'
    );

  const directorCallLink =
    wrap.querySelector(
      '[data-director-call]'
    );

  const companyEmailLink =
    wrap.querySelector(
      '[data-company-email]'
    );

  let config = {
    hotline: '0913712195',

    directorPhone:
      '0913712195',

    directorZaloUrl:
      'https://zalo.me/0913712195',

    companyEmail:
      'ctytienbao@gmail.com',

    welcome:
      `Xin chào Anh/Chị!

Em là trợ lý tư vấn của Sơn Tiến Bảo.

Anh/Chị cần hỗ trợ nội dung nào?`,

    quickReplies: [
      'Tra sản phẩm / bảng giá',
      'Tư vấn sơn nội thất',
      'Tư vấn sơn ngoại thất',
      'Tư vấn chống thấm',
      'Nhận báo giá',
      'Tư vấn trực tiếp'
    ]
  };

  let sessionId =
    localStorage.getItem(
      STORAGE_SESSION
    ) || '';

  let busy = false;
  let messages = [];

  try {
    messages = JSON.parse(
      localStorage.getItem(
        STORAGE_MESSAGES
      ) || '[]'
    );

    if (!Array.isArray(messages)) {
      messages = [];
    }
  } catch {
    messages = [];
  }

  function phoneValue() {
    return String(
      config.directorPhone ||
      config.hotline ||
      '0913712195'
    ).trim();
  }

  function zaloValue() {
    return String(
      config.directorZaloUrl ||
      `https://zalo.me/${phoneValue()}`
    ).trim();
  }

  function emailValue() {
    return String(
      config.companyEmail ||
      config.email ||
      'ctytienbao@gmail.com'
    ).trim();
  }

  function applyContactConfig() {
    const phone = phoneValue();
    const email = emailValue();

    directorZaloLink.href =
      zaloValue();

    directorZaloLink.textContent =
      '💬 Zalo';

    directorCallLink.href =
      `tel:${phone}`;

    directorCallLink.textContent =
      '📞 Gọi';

    companyEmailLink.href =
      `mailto:${email}`;

    companyEmailLink.textContent =
      '✉️ Email';

    companyEmailLink.title = email;
  }

  function openDirectorZalo() {
    window.open(
      zaloValue(),
      '_blank',
      'noopener,noreferrer'
    );
  }

  function nowLabel() {
    return new Date()
      .toLocaleTimeString(
        'vi-VN',
        {
          hour: '2-digit',
          minute: '2-digit'
        }
      );
  }

  function saveMessages() {
    try {
      localStorage.setItem(
        STORAGE_MESSAGES,
        JSON.stringify(
          messages.slice(
            -MAX_STORED_MESSAGES
          )
        )
      );
    } catch {
      // Trình duyệt có thể chặn localStorage.
    }
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      body.scrollTop =
        body.scrollHeight;
    });
  }

  function removeQuickReplies() {
    body
      .querySelectorAll('.stb-quick')
      .forEach((element) => {
        element.remove();
      });
  }

  /*
   * Chỉ sửa khoảng cách hiển thị.
   * Không viết lại nội dung AI.
   */
  function normalizeBotText(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(
        /[ \t]+(?=(?:\d{1,2}[.)]|[-•✓])\s+)/g,
        '\n'
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function renderMessageContent(
    content,
    role,
    text
  ) {
    const value =
      String(text || '').trim();

    if (role !== 'bot') {
      content.textContent = value;
      return;
    }

    content.classList.add(
      'stb-bubble-content'
    );

    const normalized =
      normalizeBotText(value);

    const blocks =
      normalized
        .split(/\n{2,}/)
        .filter(Boolean);

    if (!blocks.length) {
      content.textContent = value;
      return;
    }

    blocks.forEach((block) => {
      const paragraph =
        document.createElement('p');

      paragraph.className =
        'stb-bubble-paragraph';

      paragraph.textContent =
        block.trim();

      content.appendChild(paragraph);
    });
  }

  function addMessage(
    role,
    text,
    sources = [],
    persist = true
  ) {
    const row =
      document.createElement('div');

    row.className =
      `stb-row ${role}`;

    const bubble =
      document.createElement('div');

    bubble.className = 'stb-bubble';

    const content =
      document.createElement('div');

    renderMessageContent(
      content,
      role,
      text
    );

    bubble.appendChild(content);

    const validSources =
      Array.isArray(sources)
        ? sources
            .filter(
              (source) =>
                source?.url
            )
            .slice(
              0,
              MAX_VISIBLE_SOURCES
            )
        : [];

    if (validSources.length) {
      const sourceBox =
        document.createElement('div');

      sourceBox.className =
        'stb-sources';

      const sourceTitle =
        document.createElement('div');

      sourceTitle.className =
        'stb-sources-title';

      sourceTitle.textContent =
        'Sản phẩm / tài liệu liên quan';

      sourceBox.appendChild(
        sourceTitle
      );

      validSources.forEach(
        (source) => {
          const link =
            document.createElement('a');

          link.className =
            'stb-source';

          link.href = source.url;
          link.target = '_blank';

          link.rel =
            'noopener noreferrer';

          link.textContent =
            source.title ||
            'Xem thông tin trên sontienbao.com';

          sourceBox.appendChild(link);
        }
      );

      bubble.appendChild(sourceBox);
    }

    const time =
      document.createElement('div');

    time.className = 'stb-time';
    time.textContent = nowLabel();

    bubble.appendChild(time);
    row.appendChild(bubble);
    body.appendChild(row);

    if (persist) {
      messages.push({
        role,
        text,
        sources: validSources,
        time: Date.now()
      });

      saveMessages();
    }

    scrollBottom();
  }

  function addQuickReplies(items) {
    removeQuickReplies();

    if (
      !Array.isArray(items) ||
      !items.length
    ) {
      return;
    }

    const quick =
      document.createElement('div');

    quick.className = 'stb-quick';

    items
      .slice(0, 6)
      .forEach((label) => {
        const button =
          document.createElement(
            'button'
          );

        button.type = 'button';
        button.className = 'stb-chip';
        button.textContent = label;

        button.addEventListener(
          'click',
          () => {
            removeQuickReplies();
            handleQuickReply(label);
          }
        );

        quick.appendChild(button);
      });

    body.appendChild(quick);
    scrollBottom();
  }

  function showTyping() {
    const row =
      document.createElement('div');

    row.className = 'stb-row bot';
    row.dataset.typing = '1';

    row.innerHTML = `
      <div class="stb-bubble">
        <span class="stb-typing">
          <i></i><i></i><i></i>
        </span>
      </div>
    `;

    body.appendChild(row);
    scrollBottom();
  }

  function hideTyping() {
    body
      .querySelector(
        '[data-typing="1"]'
      )
      ?.remove();
  }

  async function ensureSession() {
    if (sessionId) {
      return sessionId;
    }

    const response = await fetch(
      `${apiBase}/api/web-chat/session`,
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: '{}'
      }
    );

    if (!response.ok) {
      throw new Error(
        'Không tạo được phiên trò chuyện'
      );
    }

    const data =
      await response.json();

    sessionId = data.sessionId;

    localStorage.setItem(
      STORAGE_SESSION,
      sessionId
    );

    return sessionId;
  }

  async function sendMessage(value) {
    const message =
      String(
        value || textarea.value
      ).trim();

    if (!message || busy) {
      return;
    }

    busy = true;
    send.disabled = true;

    textarea.value = '';
    textarea.style.height = 'auto';

    removeQuickReplies();
    addMessage('user', message);
    showTyping();

    try {
      await ensureSession();

      const response = await fetch(
        `${apiBase}/api/web-chat/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            sessionId,
            message
          })
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      hideTyping();

      if (!response.ok) {
        throw new Error(
          data.message ||
          'Không gửi được tin nhắn'
        );
      }

      addMessage(
        'bot',
        data.reply ||
        'Em chưa nhận được nội dung phản hồi.',
        data.sources || []
      );

      if (
        Array.isArray(data.quickReplies) &&
        data.quickReplies.length
      ) {
        addQuickReplies(
          data.quickReplies
        );
      } else {
        addQuickReplies([
          'Hỏi thêm',
          'Nhận báo giá',
          'Tư vấn trực tiếp'
        ]);
      }
    } catch {
      hideTyping();

      addMessage(
        'bot',
        `Kết nối đang tạm gián đoạn.

Anh/Chị có thể liên hệ trực tiếp qua Zalo, điện thoại hoặc email ở phía trên.`
      );

      addQuickReplies([
        'Nhận báo giá',
        'Tư vấn trực tiếp'
      ]);
    } finally {
      busy = false;
      send.disabled = false;
      textarea.focus();
    }
  }

  function addSuccessActions(
    zaloUrl,
    phone
  ) {
    const actions =
      document.createElement('div');

    actions.className =
      'stb-success-actions';

    const zalo =
      document.createElement('a');

    zalo.className =
      'stb-success-zalo';

    zalo.href = zaloUrl;
    zalo.target = '_blank';

    zalo.rel =
      'noopener noreferrer';

    zalo.textContent =
      '💬 Chat Zalo';

    const call =
      document.createElement('a');

    call.className =
      'stb-success-call';

    call.href = `tel:${phone}`;
    call.textContent = '📞 Gọi ngay';

    actions.append(zalo, call);
    body.appendChild(actions);
    scrollBottom();
  }

  function showLeadForm() {
    if (
      body.querySelector('.stb-lead')
    ) {
      return;
    }

    removeQuickReplies();

    const form =
      document.createElement('form');

    form.className = 'stb-lead';

    form.innerHTML = `
      <div class="stb-lead-head">
        <div>
          <div class="stb-lead-title">
            Nhận tư vấn và báo giá
          </div>

          <div class="stb-lead-sub">
            Anh/Chị để lại thông tin ngắn gọn.
            Sơn Tiến Bảo sẽ liên hệ để xác nhận
            sản phẩm, kỹ thuật và giá bán.
          </div>
        </div>

        <span class="stb-lead-badge">
          Phản hồi sớm
        </span>
      </div>

      <div class="stb-form-grid">
        <label class="stb-form-group">
          <span class="stb-label">
            Họ và tên
            <span class="stb-required">
              *
            </span>
          </span>

          <input
            class="stb-field"
            name="name"
            maxlength="80"
            autocomplete="name"
            required
            placeholder="Ví dụ: Nguyễn Văn Nam">
        </label>

        <label class="stb-form-group">
          <span class="stb-label">
            Số điện thoại
            <span class="stb-required">
              *
            </span>
          </span>

          <input
            class="stb-field"
            name="phone"
            maxlength="15"
            autocomplete="tel"
            inputmode="tel"
            required
            placeholder="Ví dụ: 0912345678">
        </label>

        <label class="stb-form-group">
          <span class="stb-label">
            Nhu cầu cần tư vấn
            <span class="stb-required">
              *
            </span>
          </span>

          <textarea
            class="stb-field"
            name="need"
            maxlength="1000"
            required
            placeholder="Ví dụ: cần sơn ngoại thất nhà 2 tầng, khoảng 120 m² tại Thủ Đức...">
          </textarea>

          <span class="stb-field-help">
            Có thể ghi sản phẩm quan tâm,
            diện tích, khu vực và tình trạng
            bề mặt.
          </span>
        </label>
      </div>

      <div
        class="stb-form-error"
        role="alert"
        hidden>
      </div>

      <div class="stb-contact-hint">
        <span>Liên hệ trực tiếp:</span>

        <a href="tel:${phoneValue()}">
          ${phoneValue()}
        </a>

        <a href="mailto:${emailValue()}">
          ${emailValue()}
        </a>
      </div>

      <div class="stb-lead-actions">
        <button
          class="stb-secondary"
          type="button">
          Để sau
        </button>

        <button
          class="stb-primary"
          type="submit">
          Gửi yêu cầu
        </button>
      </div>
    `;

    const errorBox =
      form.querySelector(
        '.stb-form-error'
      );

    const submit =
      form.querySelector(
        '.stb-primary'
      );

    function showFormError(message) {
      errorBox.textContent = message;
      errorBox.hidden = !message;
    }

    form
      .querySelector(
        '.stb-secondary'
      )
      .addEventListener(
        'click',
        () => {
          form.remove();

          addQuickReplies([
            'Tra sản phẩm / bảng giá',
            'Hỏi thêm',
            'Tư vấn trực tiếp'
          ]);
        }
      );

    form.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault();

        const fd =
          new FormData(form);

        const name =
          String(
            fd.get('name') || ''
          ).trim();

        const rawPhone =
          String(
            fd.get('phone') || ''
          ).trim();

        const phone =
          rawPhone.replace(
            /[^\d]/g,
            ''
          );

        const need =
          String(
            fd.get('need') || ''
          ).trim();

        showFormError('');

        if (name.length < 2) {
          showFormError(
            'Anh/Chị vui lòng nhập họ tên hợp lệ.'
          );
          return;
        }

        if (!/^0\d{9,10}$/.test(phone)) {
          showFormError(
            'Số điện thoại chưa đúng. Ví dụ: 0912345678.'
          );
          return;
        }

        if (need.length < 10) {
          showFormError(
            'Anh/Chị vui lòng mô tả nhu cầu rõ hơn một chút.'
          );
          return;
        }

        submit.disabled = true;
        submit.textContent =
          'Đang gửi...';

        try {
          await ensureSession();

          const response = await fetch(
            `${apiBase}/api/web-chat/lead`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body: JSON.stringify({
                sessionId,
                name,
                phone,
                need
              })
            }
          );

          const data = await response
            .json()
            .catch(() => ({}));

          if (!response.ok) {
            throw new Error(
              data.message ||
              'Không gửi được yêu cầu'
            );
          }

          form.remove();

          addMessage(
            'bot',
            data.message ||
            `Đã tiếp nhận thông tin của Anh/Chị.

Bộ phận tư vấn Sơn Tiến Bảo sẽ liên hệ lại qua số ${phone}.`
          );

          addSuccessActions(
            data.directorZaloUrl ||
            zaloValue(),
            data.directorPhone ||
            phoneValue()
          );
        } catch (error) {
          submit.disabled = false;
          submit.textContent =
            'Gửi yêu cầu';

          showFormError(
            error instanceof Error
              ? error.message
              : 'Không gửi được yêu cầu. Vui lòng thử lại.'
          );
        }
      }
    );

    body.appendChild(form);
    scrollBottom();

    form
      .querySelector(
        'input[name="name"]'
      )
      ?.focus();
  }

  function handleQuickReply(label) {
    const normalized =
      String(label)
        .trim()
        .toLowerCase();

    if (
      normalized.includes(
        'nhận báo giá'
      ) ||
      normalized === 'báo giá'
    ) {
      showLeadForm();
      return;
    }

    if (
      normalized.includes(
        'tư vấn trực tiếp'
      ) ||
      normalized.includes(
        'gặp nhân viên'
      ) ||
      normalized.includes(
        'chat zalo'
      ) ||
      normalized.includes(
        'gặp giám đốc'
      )
    ) {
      openDirectorZalo();
      return;
    }

    if (normalized.includes('gọi')) {
      window.location.href =
        `tel:${phoneValue()}`;

      return;
    }

    if (normalized === 'hỏi thêm') {
      textarea.focus();
      return;
    }

    sendMessage(label);
  }

  async function initialize() {
    try {
      const response = await fetch(
        `${apiBase}/api/web-chat/config`
      );

      if (response.ok) {
        config = {
          ...config,
          ...(await response.json())
        };
      }
    } catch {
      // Dùng cấu hình mặc định.
    }

    applyContactConfig();

    if (messages.length) {
      messages.forEach((message) => {
        addMessage(
          message.role,
          message.text,
          message.sources || [],
          false
        );
      });

      addQuickReplies([
        'Hỏi thêm',
        'Nhận báo giá',
        'Tư vấn trực tiếp'
      ]);
    } else {
      addMessage(
        'bot',
        config.welcome
      );

      addQuickReplies(
        config.quickReplies
      );
    }
  }

  launch.addEventListener(
    'click',
    () => {
      panel.classList.toggle('open');

      launch
        .querySelector('.stb-badge')
        ?.remove();

      if (
        panel.classList.contains(
          'open'
        )
      ) {
        scrollBottom();

        setTimeout(() => {
          textarea.focus();
        }, 120);
      }
    }
  );

  close.addEventListener(
    'click',
    () => {
      panel.classList.remove('open');
    }
  );

  send.addEventListener(
    'click',
    () => {
      sendMessage();
    }
  );

  textarea.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Enter' &&
        !event.shiftKey
      ) {
        event.preventDefault();
        sendMessage();
      }
    }
  );

  textarea.addEventListener(
    'input',
    () => {
      textarea.style.height = 'auto';

      textarea.style.height =
        `${Math.min(
          textarea.scrollHeight,
          90
        )}px`;
    }
  );

  initialize();
})();