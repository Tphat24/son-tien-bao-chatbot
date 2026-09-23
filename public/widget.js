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
  const BRAND_LOGO_URL =
    'https://media.loveitopcdn.com/41744/logo.png';

  /*
   * Bootstrap Icons 1.13.1 dạng SVG nội tuyến.
   * Không dùng icon font để tránh ô vuông trong Shadow DOM/CSP.
   */
  const BOOTSTRAP_ICONS = {
    'chat-dots-fill': '<path d="M16 8c0 3.866-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.584.296-1.925.864-4.181 1.234-.2.032-.352-.176-.273-.362.354-.836.674-1.95.77-2.966C.744 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7M5 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0m4 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0m3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/>',
    'x-lg': '<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>',
    'dash-lg': '<path fill-rule="evenodd" d="M2 8a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 8"/>',
    'telephone-fill': '<path fill-rule="evenodd" d="M1.885.511a1.745 1.745 0 0 1 2.61.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.68.68 0 0 0 .178.643l2.457 2.457a.68.68 0 0 0 .644.178l2.189-.547a1.75 1.75 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.6 18.6 0 0 1-7.01-4.42 18.6 18.6 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877z"/>',
    'envelope-fill': '<path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414zM0 4.697v7.104l5.803-3.558zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586zm3.436-.586L16 11.801V4.697z"/>',
    'send-fill': '<path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 0 0-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 0 0 .886-.083zm-1.833 1.89L6.637 10.07l-.215-.338a.5.5 0 0 0-.154-.154l-.338-.215 7.494-7.494 1.178-.471z"/>',
    'shield-check': '<path d="M5.338 1.59a61 61 0 0 0-2.837.856.48.48 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.7 10.7 0 0 0 2.287 2.233c.346.244.652.42.893.533q.18.085.293.118a1 1 0 0 0 .101.025 1 1 0 0 0 .1-.025q.114-.034.294-.118c.24-.113.547-.29.893-.533a10.7 10.7 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067c-.53 0-1.552.223-2.662.524zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.8 11.8 0 0 1-2.517 2.453 7 7 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7 7 0 0 1-1.048-.625 11.8 11.8 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 63 63 0 0 1 5.072.56"/><path d="M10.854 5.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 7.793l2.646-2.647a.5.5 0 0 1 .708 0"/>',
    'stars': '<path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 0 0 1.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 0 0-1.828 1.829l-.645 1.936a.361.361 0 0 1-.686 0l-.645-1.937a2.89 2.89 0 0 0-1.828-1.828l-1.937-.645a.361.361 0 0 1 0-.686l1.937-.645a2.89 2.89 0 0 0 1.828-1.828zM3.794 1.148a.217.217 0 0 1 .412 0l.387 1.162c.173.518.579.924 1.097 1.097l1.162.387a.217.217 0 0 1 0 .412l-1.162.387A1.73 1.73 0 0 0 4.593 5.69l-.387 1.162a.217.217 0 0 1-.412 0L3.407 5.69A1.73 1.73 0 0 0 2.31 4.593l-1.162-.387a.217.217 0 0 1 0-.412l1.162-.387A1.73 1.73 0 0 0 3.407 2.31zM10.863.099a.145.145 0 0 1 .274 0l.258.774c.115.346.386.617.732.732l.774.258a.145.145 0 0 1 0 .274l-.774.258a1.16 1.16 0 0 0-.732.732l-.258.774a.145.145 0 0 1-.274 0l-.258-.774a1.16 1.16 0 0 0-.732-.732L9.1 2.137a.145.145 0 0 1 0-.274l.774-.258c.346-.115.617-.386.732-.732z"/>',
    'journal-check': '<path fill-rule="evenodd" d="M10.854 6.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7.5 8.793l2.646-2.647a.5.5 0 0 1 .708 0"/><path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/><path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z"/>',
    'arrow-up-right': '<path fill-rule="evenodd" d="M14 2.5a.5.5 0 0 0-.5-.5h-6a.5.5 0 0 0 0 1h4.793L2.146 13.146a.5.5 0 0 0 .708.708L13 3.707V8.5a.5.5 0 0 0 1 0z"/>',
    'chat-square-text': '<path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2.5a2 2 0 0 0-1.6.8L8 14.333 6.1 11.8a2 2 0 0 0-1.6-.8H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5a1 1 0 0 1 .8.4l1.9 2.533a1 1 0 0 0 1.6 0l1.9-2.533a1 1 0 0 1 .8-.4H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z"/><path d="M3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5M3 6a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 6m0 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5"/>',
    'tags': '<path d="M3 2v4.586l7 7L14.586 9l-7-7zM2 2a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 2 6.586z"/><path d="M5.5 5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m0 1a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M1 7.086a1 1 0 0 0 .293.707L8.75 15.25l-.043.043a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 0 7.586V3a1 1 0 0 1 1-1z"/>',
    'house-door': '<path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293zM2.5 14V7.707l5.5-5.5 5.5 5.5V14H10v-4a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v4z"/>',
    'buildings': '<path d="M14.763.075A.5.5 0 0 1 15 .5v15a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V14h-1v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10a.5.5 0 0 1 .342-.474L6 7.64V4.5a.5.5 0 0 1 .276-.447l8-4a.5.5 0 0 1 .487.022M6 8.694 1 10.36V15h5zM7 15h2v-1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V15h2V1.309l-7 3.5z"/><path d="M2 11h1v1H2zm2 0h1v1H4zm-2 2h1v1H2zm2 0h1v1H4zm4-4h1v1H8zm2 0h1v1h-1zm-2 2h1v1H8zm2 0h1v1h-1zm2-2h1v1h-1zm0 2h1v1h-1zM8 7h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zM8 5h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zm0-2h1v1h-1z"/>',
    'droplet-half': '<path fill-rule="evenodd" d="M7.21.8C7.69.295 8 0 8 0q.164.544.371 1.038c.812 1.946 2.073 3.35 3.197 4.6C12.878 7.096 14 8.345 14 10a6 6 0 0 1-12 0C2 6.668 5.58 2.517 7.21.8m.413 1.021A31 31 0 0 0 5.794 3.99c-.726.95-1.436 2.008-1.96 3.07C3.304 8.133 3 9.138 3 10c0 0 2.5 1.5 5 .5s5-.5 5-.5c0-1.201-.796-2.157-2.181-3.7l-.03-.032C9.75 5.11 8.5 3.72 7.623 1.82z"/><path fill-rule="evenodd" d="M4.553 7.776c.82-1.641 1.717-2.753 2.093-3.13l.708.708c-.29.29-1.128 1.311-1.907 2.87z"/>',
    'headset': '<path d="M8 1a5 5 0 0 0-5 5v1h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a6 6 0 1 1 12 0v6a2.5 2.5 0 0 1-2.5 2.5H9.366a1 1 0 0 1-.866.5h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 .866.5H11.5A1.5 1.5 0 0 0 13 12h-1a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1V6a5 5 0 0 0-5-5"/>',
    'telephone': '<path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.6 17.6 0 0 0 4.168 6.608 17.6 17.6 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.68.68 0 0 0-.58-.122l-2.19.547a1.75 1.75 0 0 1-1.657-.459L5.482 8.062a1.75 1.75 0 0 1-.46-1.657l.548-2.19a.68.68 0 0 0-.122-.58zM1.884.511a1.745 1.745 0 0 1 2.612.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.68.68 0 0 0 .178.643l2.457 2.457a.68.68 0 0 0 .644.178l2.189-.547a1.75 1.75 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.6 18.6 0 0 1-7.01-4.42 18.6 18.6 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877z"/>',
    'plus-circle': '<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>',
    'person-lines-fill': '<path d="M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5 6s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zM11 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5m.5 2.5a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1zm2 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1zm0 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1z"/>',
    'person': '<path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0m4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4m-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10s-3.516.68-4.168 1.332c-.678.678-.83 1.418-.832 1.664z"/>',
    'card-text': '<path d="M14.5 3a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5zm-13-1A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 14.5 2z"/><path d="M3 5.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5M3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8m0 2.5a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5"/>',
    'arrow-left': '<path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/>',
    'send-check': '<path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855a.75.75 0 0 0-.124 1.329l4.995 3.178 1.531 2.406a.5.5 0 0 0 .844-.536L6.637 10.07l7.494-7.494-1.895 4.738a.5.5 0 1 0 .928.372zm-2.54 1.183L5.93 9.363 1.591 6.602z"/><path d="M16 12.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0m-1.993-1.679a.5.5 0 0 0-.686.172l-1.17 1.95-.547-.547a.5.5 0 0 0-.708.708l.774.773a.75.75 0 0 0 1.174-.144l1.335-2.226a.5.5 0 0 0-.172-.686"/>'
  };

  function bootstrapIcon(name) {
    const paths =
      BOOTSTRAP_ICONS[name] ||
      BOOTSTRAP_ICONS['chat-square-text'];

    return `<svg class="stb-icon" data-icon="${name}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">${paths}</svg>`;
  }

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

    .stb-button-spinner {
      width: 13px;
      height: 13px;
      border: 2px solid rgba(255, 255, 255, .45);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: stbSpin .7s linear infinite;
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

    /* Premium UI refresh — scoped entirely inside the widget. */
    :host {
      --stb-green-950: #052e22;
      --stb-green-900: #074532;
      --stb-green-800: #075d42;
      --stb-green-700: #087552;
      --stb-green-100: #dff5e9;
      --stb-green-50: #f1fbf5;
      --stb-amber: #f5a524;
      --stb-ink: #102a20;
      --stb-muted: #66776f;
      --stb-line: #dfe9e3;
      --stb-surface: #ffffff;
      --stb-canvas: #f4f8f5;
    }

    .stb-wrap {
      ${position}: 22px;
      bottom: 22px;
      color: var(--stb-ink);
      font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
    }

    .stb-launch {
      isolation: isolate;
      width: 64px;
      height: 64px;
      border: 1px solid rgba(255, 255, 255, .28);
      border-radius: 22px;
      background: linear-gradient(145deg, #0a7b57 0%, #07523b 62%, #053d2d 100%);
      box-shadow: 0 18px 46px rgba(5, 70, 49, .34), inset 0 1px 0 rgba(255, 255, 255, .22);
      font-size: 27px;
      transition: transform .22s ease, box-shadow .22s ease, border-radius .22s ease;
    }

    .stb-launch::before {
      position: absolute;
      inset: -6px;
      z-index: -1;
      border: 1px solid rgba(8, 117, 82, .22);
      border-radius: 27px;
      content: "";
      animation: stbPulse 2.4s ease-out infinite;
    }

    .stb-launch:hover {
      transform: translateY(-3px) scale(1.03);
      box-shadow: 0 22px 54px rgba(5, 70, 49, .42), inset 0 1px 0 rgba(255, 255, 255, .26);
    }

    .stb-launch:focus-visible,
    .stb-close:focus-visible,
    .stb-chip:focus-visible,
    .stb-send:focus-visible,
    .stb-contact a:focus-visible,
    .stb-primary:focus-visible,
    .stb-secondary:focus-visible {
      outline: 3px solid rgba(245, 165, 36, .55);
      outline-offset: 3px;
    }

    .stb-icon {
      width: 1em;
      height: 1em;
      display: inline-block;
      flex: none;
      vertical-align: -.125em;
    }

    .stb-launch [data-icon="chat-dots-fill"],
    .stb-launch [data-icon="x-lg"] {
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, .18));
    }

    .stb-launch [data-icon="x-lg"] {
      display: none;
      font-size: 23px;
    }

    .stb-wrap.is-open .stb-launch .stb-launch-logo {
      display: none;
    }

    .stb-wrap.is-open .stb-launch [data-icon="x-lg"] {
      display: inline-block;
    }

    .stb-wrap.is-open .stb-launch {
      border-radius: 50%;
    }

    .stb-badge {
      top: -2px;
      right: -2px;
      width: 17px;
      height: 17px;
      border: 3px solid #fff;
      background: var(--stb-amber);
      box-shadow: 0 3px 9px rgba(120, 73, 0, .25);
    }

    .stb-panel {
      bottom: 78px;
      width: min(410px, calc(100vw - 28px));
      height: min(690px, calc(100dvh - 118px));
      border: 1px solid rgba(7, 93, 66, .14);
      border-radius: 26px;
      background: var(--stb-surface);
      box-shadow: 0 28px 80px rgba(9, 45, 33, .24), 0 8px 24px rgba(9, 45, 33, .1);
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      animation: stbOpen .28s cubic-bezier(.2, .8, .2, 1);
    }

    .stb-head {
      position: relative;
      min-height: 78px;
      padding: 15px 16px;
      gap: 12px;
      overflow: hidden;
      background: linear-gradient(125deg, #07583f 0%, #087552 58%, #0b8962 100%);
    }

    .stb-head::after {
      position: absolute;
      top: -55px;
      right: -48px;
      width: 150px;
      height: 150px;
      border: 24px solid rgba(255, 255, 255, .07);
      border-radius: 50%;
      content: "";
      pointer-events: none;
    }

    .stb-avatar {
      position: relative;
      z-index: 1;
      width: 46px;
      height: 46px;
      border: 1px solid rgba(255, 255, 255, .58);
      border-radius: 15px;
      background: linear-gradient(145deg, #fff, #eaf8f0);
      box-shadow: 0 8px 22px rgba(0, 35, 24, .2);
      color: var(--stb-green-800);
      font-size: 21px;
      overflow: hidden;
    }

    .stb-brand-mark,
    .stb-launch-logo {
      position: relative;
      overflow: hidden;
      background: #ff8000;
    }

    .stb-brand-mark::before,
    .stb-launch-logo::before {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff;
      content: "TB";
      font-size: 12px;
      font-weight: 900;
    }

    .stb-brand-mark {
      position: absolute;
      inset: 0;
    }

    .stb-brand-mark img,
    .stb-launch-logo img {
      position: absolute;
      top: 0;
      left: 0;
      width: auto;
      max-width: none;
      height: 100%;
      display: block;
      z-index: 1;
    }

    .stb-launch-logo {
      width: 45px;
      height: 45px;
      border: 2px solid rgba(255, 255, 255, .88);
      border-radius: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, .2);
    }

    .stb-avatar-status {
      position: absolute;
      right: -2px;
      bottom: -2px;
      width: 12px;
      height: 12px;
      border: 2px solid #087552;
      border-radius: 50%;
      background: #5bea9b;
    }

    .stb-head-main {
      position: relative;
      z-index: 1;
    }

    .stb-title {
      font-size: 15.5px;
      font-weight: 800;
      letter-spacing: -.01em;
    }

    .stb-status {
      margin-top: 4px;
      gap: 6px;
      font-size: 11.5px;
      opacity: .92;
    }

    .stb-dot {
      width: 6px;
      height: 6px;
      background: #83f2b5;
      box-shadow: 0 0 0 3px rgba(131, 242, 181, .13);
    }

    .stb-close {
      position: relative;
      z-index: 1;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: rgba(255, 255, 255, .1);
      font-size: 17px;
      transition: background .18s ease, transform .18s ease;
    }

    .stb-close:hover {
      background: rgba(255, 255, 255, .19);
      transform: translateY(-1px);
    }

    .stb-contact {
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--stb-line);
      background: rgba(255, 255, 255, .96);
    }

    .stb-contact a {
      min-height: 38px;
      gap: 7px;
      padding: 0 9px;
      border: 1px solid transparent;
      border-radius: 12px;
      font-size: 11.5px;
      font-weight: 750;
      transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
    }

    .stb-contact a:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(15, 50, 37, .09);
    }

    .stb-contact-zalo { background: #086bf1; }
    .stb-contact-call { border-color: #f2ddb2 !important; background: #fff8e9; color: #825100; }
    .stb-contact-email { border-color: #dce5f2 !important; background: #f3f7fc; color: #28517d; }
    .stb-contact .stb-icon { font-size: 14px; }

    .stb-body {
      padding: 17px 14px 20px;
      background:
        radial-gradient(circle at 10% 0%, rgba(8, 117, 82, .055), transparent 28%),
        linear-gradient(180deg, #f7faf8 0%, #f3f7f4 100%);
      scrollbar-color: #bfd2c7 transparent;
      scrollbar-width: thin;
    }

    .stb-row {
      gap: 8px;
      margin-bottom: 13px;
      animation: stbMessageIn .23s ease both;
    }

    .stb-message-avatar {
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      display: grid;
      place-items: center;
      border: 1px solid #d7e7de;
      border-radius: 9px;
      background: #fff;
      box-shadow: 0 3px 10px rgba(9, 58, 40, .08);
      color: var(--stb-green-700);
      font-size: 13px;
    }

    .stb-bubble {
      max-width: calc(89% - 30px);
      padding: 11px 13px 9px;
      border-radius: 17px;
      font-size: 13.5px;
      line-height: 1.58;
    }

    .stb-row.bot .stb-bubble {
      border-color: #e0e9e4;
      border-bottom-left-radius: 6px;
      box-shadow: 0 5px 16px rgba(12, 67, 47, .06);
    }

    .stb-row.user .stb-bubble {
      max-width: 86%;
      border-bottom-right-radius: 6px;
      background: linear-gradient(145deg, #087552, #075b42);
      box-shadow: 0 6px 16px rgba(7, 93, 66, .18);
    }

    .stb-bubble-content { gap: 10px; }
    .stb-time { margin-top: 6px; font-size: 9.5px; }

    .stb-sources {
      gap: 7px;
      margin-top: 12px;
      padding-top: 10px;
    }

    .stb-sources-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10.5px;
      letter-spacing: .02em;
      text-transform: uppercase;
    }

    .stb-source {
      min-height: 39px;
      padding: 8px 10px;
      border-color: #d9e7df;
      border-radius: 11px;
      background: var(--stb-green-50);
      font-size: 11px;
      font-weight: 650;
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }

    .stb-source::after { content: none; }
    .stb-source:hover { transform: translateY(-1px); }
    .stb-source .stb-icon { flex: none; font-size: 13px; }

    .stb-quick {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 4px 0 14px 36px;
    }

    .stb-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 9px 10px;
      border-color: #cfe1d7;
      border-radius: 13px;
      background: rgba(255, 255, 255, .92);
      box-shadow: 0 3px 11px rgba(13, 67, 48, .035);
      color: #174735;
      font-size: 11.5px;
      transition: transform .17s ease, border-color .17s ease, box-shadow .17s ease, background .17s ease;
    }

    .stb-chip .stb-icon {
      width: 25px;
      height: 25px;
      flex: 0 0 25px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: var(--stb-green-100);
      color: var(--stb-green-700);
      font-size: 12px;
    }

    .stb-chip:hover {
      transform: translateY(-2px);
      border-color: #67a68a;
      background: #fff;
      box-shadow: 0 7px 17px rgba(13, 67, 48, .08);
    }

    .stb-typing { padding: 4px 2px; }

    .stb-lead {
      margin-left: 36px;
      padding: 15px;
      border-color: #dbe8e1;
      border-radius: 18px;
      box-shadow: 0 8px 24px rgba(13, 67, 48, .075);
    }

    .stb-lead-title {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 14.5px;
    }

    .stb-lead-title .stb-icon { color: var(--stb-green-700); }
    .stb-lead-badge { padding: 6px 8px; background: var(--stb-green-100); }
    .stb-form-group { gap: 6px; }
    .stb-label { display: flex; align-items: center; gap: 6px; }
    .stb-label .stb-icon { color: #6f8278; font-size: 12px; }

    .stb-field {
      min-height: 42px;
      padding: 10px 12px;
      border-color: #d5e1da;
      border-radius: 12px;
      background: #f8faf9;
      transition: border-color .17s ease, box-shadow .17s ease, background .17s ease;
    }

    .stb-field:focus {
      border-color: #4a9b77;
      background: #fff;
      box-shadow: 0 0 0 4px rgba(8, 117, 82, .09);
    }

    .stb-contact-hint { border: 1px solid #e3ebe6; border-radius: 11px; }
    .stb-lead-actions { gap: 8px; }

    .stb-secondary,
    .stb-primary {
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border-radius: 11px;
      transition: transform .16s ease, box-shadow .16s ease;
    }

    .stb-primary {
      background: linear-gradient(145deg, #087552, #07563e);
      box-shadow: 0 6px 14px rgba(7, 93, 66, .16);
    }

    .stb-secondary:hover,
    .stb-primary:hover { transform: translateY(-1px); }

    .stb-success-actions { margin-left: 36px; gap: 8px; }
    .stb-success-actions a { gap: 7px; min-height: 40px; border-radius: 12px; }

    .stb-foot {
      padding: 12px 13px 10px;
      border-top-color: var(--stb-line);
      box-shadow: 0 -6px 24px rgba(17, 55, 41, .035);
    }

    .stb-input-row {
      gap: 8px;
      min-height: 49px;
      padding: 6px 6px 6px 13px;
      border-color: #d5e2da;
      border-radius: 16px;
      background: #f5f8f6;
      transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
    }

    .stb-input-row:focus-within {
      border-color: #59a382;
      background: #fff;
      box-shadow: 0 0 0 4px rgba(8, 117, 82, .075);
    }

    .stb-textarea { padding: 8px 0; font-size: 13.5px; }

    .stb-send {
      width: 39px;
      height: 39px;
      border-radius: 12px;
      background: linear-gradient(145deg, #09815b, #07563e);
      box-shadow: 0 6px 14px rgba(7, 93, 66, .2);
      font-size: 16px;
      transition: transform .17s ease, box-shadow .17s ease;
    }

    .stb-send:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 9px 18px rgba(7, 93, 66, .27);
    }

    .stb-note {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      margin-top: 7px;
      color: #7b8b83;
      font-size: 9.5px;
    }

    @keyframes stbPulse {
      0%, 55% { opacity: 0; transform: scale(.94); }
      70% { opacity: .7; }
      100% { opacity: 0; transform: scale(1.16); }
    }

    @keyframes stbMessageIn {
      from { opacity: 0; transform: translateY(7px); }
      to { opacity: 1; transform: none; }
    }

    @keyframes stbSpin {
      to { transform: rotate(360deg); }
    }

    @media (max-width: 520px) {
      .stb-wrap { ${position}: 12px; bottom: 12px; }
      .stb-panel {
        left: 8px;
        right: 8px;
        bottom: 84px;
        height: min(720px, calc(100dvh - 100px));
        border-radius: 23px;
      }
      .stb-launch { width: 60px; height: 60px; border-radius: 20px; }
      .stb-head { min-height: 72px; padding: 12px 14px; }
      .stb-contact { padding: 8px 10px; }
      .stb-contact a { min-height: 36px; padding: 0 6px; font-size: 10.5px; }
      .stb-body { padding: 14px 11px 17px; }
      .stb-quick { margin-left: 34px; gap: 7px; }
      .stb-chip { padding: 8px; font-size: 10.8px; }
      .stb-lead { margin-left: 0; }
      .stb-success-actions { margin-left: 34px; }
    }

    @media (max-width: 370px) {
      .stb-quick { grid-template-columns: 1fr; }
      .stb-contact { gap: 5px; }
      .stb-contact a { font-size: 10px; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        scroll-behavior: auto !important;
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
      }
    }
  `;

  root.appendChild(style);

  const wrap =
    document.createElement('div');

  wrap.className = 'stb-wrap';

  wrap.innerHTML = `
    <section
      id="stb-chat-panel"
      class="stb-panel"
      role="dialog"
      aria-labelledby="stb-chat-title"
      aria-hidden="true">

      <header class="stb-head">
        <div class="stb-avatar" aria-hidden="true">
          <span class="stb-brand-mark">
            <img src="${BRAND_LOGO_URL}" alt="">
          </span>
          <span class="stb-avatar-status"></span>
        </div>

        <div class="stb-head-main">
          <div class="stb-title" id="stb-chat-title">
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
          ${bootstrapIcon('dash-lg')}
        </button>
      </header>

      <div class="stb-contact">
        <a
          class="stb-contact-zalo"
          data-director-zalo
          href="https://zalo.me/0913712195"
          target="_blank"
          rel="noopener noreferrer">
          ${bootstrapIcon('chat-dots-fill')}
          <span>Zalo</span>
        </a>

        <a
          class="stb-contact-call"
          data-director-call
          href="tel:0913712195">
          ${bootstrapIcon('telephone-fill')}
          <span>Gọi ngay</span>
        </a>

        <a
          class="stb-contact-email"
          data-company-email
          href="mailto:ctytienbao@gmail.com">
          ${bootstrapIcon('envelope-fill')}
          <span>Email</span>
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
            aria-label="Nội dung cần tư vấn"
            placeholder="Nhập câu hỏi của Anh/Chị...">
          </textarea>

          <button
            class="stb-send"
            type="button"
            aria-label="Gửi tin nhắn">

            ${bootstrapIcon('send-fill')}
          </button>
        </div>

        <div class="stb-note">
          ${bootstrapIcon('shield-check')}
          AI tư vấn 24/7 • Nhân viên xác nhận báo giá
        </div>
      </footer>
    </section>

    <button
      class="stb-launch"
      type="button"
      aria-label="Mở chatbot tư vấn"
      aria-controls="stb-chat-panel"
      aria-expanded="false">

      <span class="stb-badge"></span>

      <span class="stb-launch-logo" aria-hidden="true">
        <img src="${BRAND_LOGO_URL}" alt="">
      </span>
      ${bootstrapIcon('x-lg')}
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

    directorZaloLink.innerHTML =
      `${bootstrapIcon('chat-dots-fill')}<span>Zalo</span>`;

    directorCallLink.href =
      `tel:${phone}`;

    directorCallLink.innerHTML =
      `${bootstrapIcon('telephone-fill')}<span>Gọi ngay</span>`;

    companyEmailLink.href =
      `mailto:${email}`;

    companyEmailLink.innerHTML =
      `${bootstrapIcon('envelope-fill')}<span>Email</span>`;

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

    if (role === 'bot') {
      const avatar =
        document.createElement('span');

      avatar.className =
        'stb-message-avatar';

      avatar.setAttribute(
        'aria-hidden',
        'true'
      );

      avatar.innerHTML =
        bootstrapIcon('stars');

      row.appendChild(avatar);
    }

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
      (Array.isArray(sources) ? sources : [])
        .filter((source) => {
          if (!source?.url) {
            return false;
          }

          try {
            const url = new URL(
              source.url,
              window.location.href
            );

            return [
              'http:',
              'https:'
            ].includes(url.protocol);
          } catch {
            return false;
          }
        })
        .slice(0, MAX_VISIBLE_SOURCES);

    if (validSources.length) {
      const sourceBox =
        document.createElement('div');

      sourceBox.className =
        'stb-sources';

      const sourceTitle =
        document.createElement('div');

      sourceTitle.className =
        'stb-sources-title';

      sourceTitle.innerHTML =
        `${bootstrapIcon('journal-check')}<span>Nguồn tham khảo</span>`;

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

          const label =
            document.createElement('span');

          label.textContent =
            source.title ||
            'Xem thông tin trên sontienbao.com';

          link.appendChild(label);
          link.insertAdjacentHTML(
            'beforeend',
            bootstrapIcon(
              'arrow-up-right'
            )
          );

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

        const normalized =
          String(label).toLowerCase();

        let iconName =
          'chat-square-text';

        if (normalized.includes('sản phẩm') || normalized.includes('bảng giá')) {
          iconName = 'tags';
        } else if (normalized.includes('nội thất')) {
          iconName = 'house-door';
        } else if (normalized.includes('ngoại thất')) {
          iconName = 'buildings';
        } else if (normalized.includes('chống thấm')) {
          iconName = 'droplet-half';
        } else if (normalized.includes('trực tiếp') || normalized.includes('zalo')) {
          iconName = 'headset';
        } else if (normalized.includes('gọi')) {
          iconName = 'telephone';
        } else if (normalized.includes('hỏi thêm')) {
          iconName = 'plus-circle';
        }

        const labelText =
          document.createElement('span');

        labelText.textContent = label;
        button.insertAdjacentHTML(
          'beforeend',
          bootstrapIcon(iconName)
        );
        button.appendChild(labelText);

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
      <span class="stb-message-avatar" aria-hidden="true">
        ${bootstrapIcon('stars')}
      </span>
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

    zalo.innerHTML =
      `${bootstrapIcon('chat-dots-fill')}<span>Chat Zalo</span>`;

    const call =
      document.createElement('a');

    call.className =
      'stb-success-call';

    call.href = `tel:${phone}`;
    call.innerHTML =
      `${bootstrapIcon('telephone-fill')}<span>Gọi ngay</span>`;

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
            ${bootstrapIcon('person-lines-fill')}
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
            ${bootstrapIcon('person')}
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
            ${bootstrapIcon('telephone')}
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
            ${bootstrapIcon('card-text')}
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
          ${bootstrapIcon('arrow-left')}
          Để sau
        </button>

        <button
          class="stb-primary"
          type="submit">
          ${bootstrapIcon('send-check')}
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
        submit.innerHTML =
          '<span class="stb-button-spinner" aria-hidden="true"></span><span>Đang gửi...</span>';

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
          submit.innerHTML =
            `${bootstrapIcon('send-check')}<span>Gửi yêu cầu</span>`;

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

      const isOpen =
        panel.classList.contains('open');

      wrap.classList.toggle(
        'is-open',
        isOpen
      );

      launch.setAttribute(
        'aria-expanded',
        String(isOpen)
      );

      launch.setAttribute(
        'aria-label',
        isOpen
          ? 'Đóng chatbot tư vấn'
          : 'Mở chatbot tư vấn'
      );

      panel.setAttribute(
        'aria-hidden',
        String(!isOpen)
      );

      launch
        .querySelector('.stb-badge')
        ?.remove();

      if (isOpen) {
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
      wrap.classList.remove('is-open');
      panel.setAttribute(
        'aria-hidden',
        'true'
      );
      launch.setAttribute(
        'aria-expanded',
        'false'
      );
      launch.setAttribute(
        'aria-label',
        'Mở chatbot tư vấn'
      );
      launch.focus();
    }
  );

  root.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Escape' &&
        panel.classList.contains('open')
      ) {
        close.click();
      }
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
