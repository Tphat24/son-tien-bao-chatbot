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

  if (document.getElementById('stb-ai-chatbot')) return;

  const host = document.createElement('div');
  host.id = 'stb-ai-chatbot';
  document.body.appendChild(host);

  const root = host.attachShadow({
    mode: 'open'
  });

  const style = document.createElement('style');

  // A single stylesheet keeps the mobile and desktop layout consistent.
  style.textContent = `
    :host { all: initial; color-scheme: light; }
    *, *::before, *::after { box-sizing: border-box; }
    button, input, textarea { font: inherit; }
    button, a { -webkit-tap-highlight-color: transparent; }
    button { cursor: pointer; }
    button:focus-visible, a:focus-visible, summary:focus-visible {
      outline: 3px solid #d68a13; outline-offset: 3px;
    }
    .stb-wrap {
      position: fixed; inset: auto; ${position}: 20px;
      margin: 0; padding: 0; border: 0; background: transparent; overflow: visible;
      bottom: max(20px, env(safe-area-inset-bottom)); z-index: 2147483647;
      color: #172f25; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
      text-align: left;
    }
    .stb-icon { width: 1em; height: 1em; display: inline-block; flex: none; vertical-align: -.125em; }
    .stb-launch {
      width: 56px; height: 56px; display: grid; place-items: center;
      border: 1px solid #ffffff80; border-radius: 18px; color: white; background: #086342;
      box-shadow: 0 6px 24px #123f2938;
    }
    .stb-launch:hover { background: #074f36; }
    .stb-launch-logo, .stb-brand-mark { position: relative; display: block; overflow: hidden; background: #ff8000; }
    .stb-launch-logo { width: 38px; height: 38px; border: 2px solid white; border-radius: 12px; }
    .stb-brand-mark { width: 36px; height: 36px; border-radius: 10px; }
    .stb-launch-logo::before, .stb-brand-mark::before {
      content: "TB"; position: absolute; inset: 0; display: grid; place-items: center;
      font-size: 12px; font-weight: 800; color: white;
    }
    .stb-launch-logo img, .stb-brand-mark img { position: relative; height: 100%; width: auto; max-width: none; display: block; }
    .stb-launch [data-icon="x-lg"] { display: none; width: 22px; height: 22px; }
    .is-open .stb-launch-logo { display: none; }
    .is-open .stb-launch [data-icon="x-lg"] { display: block; }
    .stb-panel {
      position: fixed; inset: auto; ${position}: 20px;
      bottom: max(88px, calc(env(safe-area-inset-bottom) + 68px));
      width: min(420px, calc(100vw - 32px));
      height: min(680px, calc(100dvh - 112px));
      margin: 0; padding: 0; border: 1px solid #ceddd4; border-radius: 18px;
      background: white; color: #172f25; box-shadow: 0 16px 64px #123f2940;
      overflow: hidden; display: none;
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
      text-align: left; z-index: 2147483647;
    }
    .stb-panel.open { display: grid; }
    .stb-panel::backdrop { background: transparent; pointer-events: none; }
    .stb-head { display: flex; gap: 10px; align-items: center; padding: 12px 14px; color: white; background: #086342; }
    .stb-avatar { flex: none; }
    .stb-avatar-status { display: none; }
    .stb-head-main { min-width: 0; flex: 1; }
    .stb-title { font-size: 15px; font-weight: 750; line-height: 1.3; }
    .stb-status { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 12px; color: #e3f5ea; }
    .stb-dot { width: 6px; height: 6px; background: #a6f1c3; border-radius: 50%; }
    .stb-close { display: grid; place-items: center; flex: none; width: 44px; height: 44px; border: 0; border-radius: 10px; background: #ffffff18; color: white; }
    .stb-close:hover { background: #ffffff30; }
    .stb-contact { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 6px 12px; border-bottom: 1px solid #e0e8e3; }
    .stb-contact a { display: flex; gap: 6px; align-items: center; justify-content: center; min-height: 38px; border-radius: 8px; text-decoration: none; color: #17523a; font-size: 13px; font-weight: 650; }
    .stb-contact a:hover { background: #edf5f0; }
    .stb-contact .stb-icon { font-size: 14px; }
    .stb-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px 14px; background: #f4f7f5; scrollbar-width: thin; scrollbar-color: #b8ccbf transparent; }
    .stb-row { display: flex; margin: 0 0 16px; }
    .stb-row.user { justify-content: flex-end; }
    .stb-message-avatar { display: none; }
    .stb-bubble { min-width: 0; max-width: 100%; padding: 12px 14px 9px; border-radius: 14px; font-size: 15px; line-height: 1.7; overflow-wrap: anywhere; }
    .stb-row.bot .stb-bubble { width: 100%; border: 1px solid #dce6df; border-bottom-left-radius: 4px; background: white; }
    .stb-row.user .stb-bubble { max-width: 88%; border-bottom-right-radius: 4px; background: #086342; color: white; white-space: pre-wrap; }
    .stb-bubble-content { display: grid; gap: 12px; }
    .stb-bubble-paragraph { margin: 0; white-space: pre-wrap; }
    .stb-bubble-content ul, .stb-bubble-content ol { margin: 0; padding-left: 22px; }
    .stb-bubble-content li + li { margin-top: 8px; }
    .stb-time { margin-top: 8px; font-size: 11px; line-height: 1.4; color: #66776b; }
    .stb-row.user .stb-time { color: #d6ebdf; text-align: right; }
    .stb-quick { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
    .stb-chip { display: flex; gap: 6px; align-items: center; min-height: 40px; padding: 8px 11px; border: 1px solid #cadbd0; border-radius: 10px; background: white; color: #245039; font-size: 13px; line-height: 1.4; text-align: left; }
    .stb-chip:hover { background: #eaf4ed; border-color: #7ca98c; }
    .stb-chip .stb-icon { font-size: 14px; }
    .stb-typing { display: inline-flex; gap: 5px; padding: 4px 0; }
    .stb-typing i { width: 6px; height: 6px; border-radius: 50%; background: #607c68; animation: stbBounce 1s infinite ease-in-out; }
    .stb-typing i:nth-child(2) { animation-delay: .12s; }
    .stb-typing i:nth-child(3) { animation-delay: .24s; }
    .stb-lead { margin: 0 0 16px; padding: 14px; border: 1px solid #d1e0d6; border-radius: 14px; background: white; }
    .stb-lead-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
    .stb-lead-title { font-weight: 750; font-size: 15px; }
    .stb-lead-sub { margin-top: 4px; font-size: 12px; color: #596f60; line-height: 1.6; }
    .stb-lead-badge { display: none; }
    .stb-form-grid, .stb-form-group { display: grid; gap: 12px; }
    .stb-form-group { gap: 5px; }
    .stb-label { font-size: 13px; font-weight: 650; }
    .stb-label .stb-icon { margin-right: 4px; }
    .stb-required { color: #b22c2c; }
    .stb-field { width: 100%; min-height: 44px; padding: 10px; border: 1px solid #bdcec2; border-radius: 8px; background: white; color: #172f25; font-size: 16px; }
    .stb-field:focus { outline: 2px solid #137346; outline-offset: 1px; }
    textarea.stb-field { min-height: 96px; resize: vertical; }
    .stb-field-help { font-size: 12px; color: #596f60; line-height: 1.5; }
    .stb-form-error { margin-top: 10px; padding: 9px; border: 1px solid #e4b7b7; border-radius: 8px; background: #fff3f3; color: #942525; font-size: 13px; }
    .stb-form-error[hidden] { display: none; }
    .stb-contact-hint { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 12px; font-size: 12px; color: #596f60; }
    .stb-contact-hint a { color: #17583c; }
    .stb-lead-actions, .stb-success-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .stb-secondary, .stb-primary, .stb-success-actions a { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 9px; border: 0; border-radius: 9px; font-size: 13px; font-weight: 650; text-decoration: none; }
    .stb-secondary { background: #edf2ef; color: #294d37; }
    .stb-primary, .stb-success-call { background: #086342; color: white; }
    .stb-success-zalo { background: #0068dd; color: white; }
    .stb-success-actions { margin-bottom: 16px; }
    .stb-button-spinner { width: 14px; height: 14px; border: 2px solid #ffffff70; border-top-color: white; border-radius: 50%; animation: stbSpin .7s linear infinite; }
    .stb-foot { padding: 10px 12px; border-top: 1px solid #dce6df; background: white; }
    .stb-input-row { display: flex; align-items: flex-end; gap: 8px; padding: 4px 4px 4px 12px; border: 1px solid #bdcec2; border-radius: 12px; background: white; }
    .stb-input-row:focus-within { outline: 2px solid #137346; outline-offset: 1px; }
    .stb-textarea { flex: 1; min-width: 0; max-height: 90px; padding: 10px 0; border: 0; outline: none; resize: none; background: transparent; color: #172f25; font-size: 16px; line-height: 1.5; }
    .stb-textarea::placeholder { color: #687c6d; }
    .stb-send { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 0; border-radius: 9px; background: #086342; color: white; }
    .stb-send .stb-icon { font-size: 18px; }
    .stb-send:disabled, .stb-primary:disabled { opacity: .55; cursor: not-allowed; }
    .stb-note { display: flex; justify-content: center; gap: 5px; align-items: center; margin-top: 7px; font-size: 11px; color: #596f60; line-height: 1.4; text-align: center; }
    @keyframes stbBounce { 0%, 60%, 100% { opacity: .4; } 30% { opacity: 1; } }
    @keyframes stbSpin { to { transform: rotate(360deg); } }
    @media (max-width: 520px) {
      .stb-wrap { ${position}: 12px; bottom: max(12px, env(safe-area-inset-bottom)); }
      .stb-launch { width: 48px; height: 48px; border-radius: 15px; }
      .stb-launch-logo { width: 32px; height: 32px; border-radius: 10px; }
      .is-open .stb-launch { visibility: hidden; }
      .stb-panel {
        left: 8px; right: 8px; bottom: auto; width: auto;
        top: calc(var(--stb-viewport-top, 0px) + max(8px, env(safe-area-inset-top)));
        height: min(720px, calc(var(--stb-viewport-height, 100dvh) - max(8px, env(safe-area-inset-top)) - max(8px, env(safe-area-inset-bottom))));
        border-radius: 14px;
      }
      .stb-head { padding: 8px 10px; }
      .stb-body { padding: 12px 10px; }
      .stb-bubble { padding: 11px 12px 9px; }
      .stb-chip { min-height: 44px; }
      .stb-contact { padding: 3px 8px; }
      .stb-contact a { min-height: 40px; }
    }
    @media (max-height: 500px) { .stb-note, .stb-status { display: none; } .stb-head { padding: 4px 10px; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; scroll-behavior: auto !important; } }
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
          ${bootstrapIcon('x-lg')}
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
        role="log" aria-label="Cuộc trò chuyện" aria-live="polite" aria-relevant="additions">
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

  let sessionId = '';
  try { sessionId = localStorage.getItem(STORAGE_SESSION) || ''; } catch { /* Session stays in memory. */ }

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

    let list = null;
    for (const line of normalized.split('\n')) {
      const value = line.trim();
      if (!value) { list = null; continue; }
      const bullet = value.match(/^(?:[-•✓]\s+|\d{1,2}[.)]\s+)(.*)$/);
      if (bullet) {
        const tag = /^\d/.test(value) ? 'ol' : 'ul';
        if (!list || list.localName !== tag) {
          list = document.createElement(tag);
          if (tag === 'ol') list.start = Number(value.match(/^\d+/)[0]);
          content.appendChild(list);
        }
        const item = document.createElement('li');
        item.textContent = bullet[1];
        list.appendChild(item);
      } else {
        list = null;
        const paragraph = document.createElement('p');
        paragraph.className = 'stb-bubble-paragraph';
        paragraph.textContent = value;
        content.appendChild(paragraph);
      }
    }
  }

  function addMessage(
    role,
    text,
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

    try { localStorage.setItem(STORAGE_SESSION, sessionId); } catch { /* Session stays in memory. */ }

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
        'Em chưa nhận được nội dung phản hồi.'
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
      if (panel.classList.contains('open') && !window.matchMedia('(max-width: 520px)').matches) textarea.focus();
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
    if (normalized.includes('để lại yêu cầu')) {
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

  // Only known advertising containers and explicitly configured popups are suppressed.
  // Never guess generic .modal/.popup selectors: those can contain checkout or consent forms.
  const suppressSelectors = [
    '[data-stb-chat-suppress]', '.adsbygoogle',
    'iframe[src*="googleads.g.doubleclick.net"]',
    'iframe[src*="tpc.googlesyndication.com"]',
    ...(script?.dataset.hideSelectors || '').split(';').filter(Boolean)
  ].filter((selector) => {
    try { document.querySelector(selector); return true; } catch { return false; }
  });
  const suppressed = new Map();
  const suppressionToken = `stb-${Math.random().toString(36).slice(2)}`;
  const shieldStyle = document.createElement('style');
  shieldStyle.textContent = `[data-stb-chat-suppressed="${suppressionToken}"] { visibility: hidden !important; pointer-events: none !important; }`;
  let shieldFrame = 0;
  function suppressPopups() {
    shieldFrame = 0;
    if (!panel.classList.contains('open') || script?.dataset.suppressAds === 'false') return;
    for (const selector of suppressSelectors) {
      document.querySelectorAll(selector).forEach((element) => {
        if (element === host || element.contains(host) || suppressed.has(element)) return;
        suppressed.set(element, element.getAttribute('data-stb-chat-suppressed'));
        element.setAttribute('data-stb-chat-suppressed', suppressionToken);
      });
    }
  }
  const shieldObserver = new MutationObserver(() => {
    if (!shieldFrame) shieldFrame = requestAnimationFrame(suppressPopups);
  });
  function updateViewport() {
    const viewport = window.visualViewport;
    host.style.setProperty('--stb-viewport-height', `${viewport?.height || window.innerHeight}px`);
    host.style.setProperty('--stb-viewport-top', `${viewport?.offsetTop || 0}px`);
  }
  window.visualViewport?.addEventListener('resize', updateViewport);
  window.visualViewport?.addEventListener('scroll', updateViewport);
  window.addEventListener('resize', updateViewport);
  updateViewport();

  // The browser top layer prevents ordinary high-z-index popups from covering chat.
  if (typeof wrap.showPopover === 'function') {
    wrap.setAttribute('popover', 'manual');
    try { wrap.showPopover(); } catch { wrap.removeAttribute('popover'); }
  }
  if (typeof panel.showPopover === 'function') panel.setAttribute('popover', 'manual');
  function setOpen(isOpen) {
    panel.classList.toggle('open', isOpen);
    wrap.classList.toggle('is-open', isOpen);
    launch.setAttribute('aria-expanded', String(isOpen));
    launch.setAttribute('aria-label', isOpen ? 'Đóng chatbot tư vấn' : 'Mở chatbot tư vấn');
    panel.setAttribute('aria-hidden', String(!isOpen));
    if (isOpen) {
      updateViewport();
      try { panel.showPopover?.(); } catch { /* Fixed-position fallback on older browsers. */ }
      if (script?.dataset.suppressAds !== 'false') {
        document.head.appendChild(shieldStyle);
        suppressPopups();
        shieldObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      }
      scrollBottom();
      // Focus close on mobile so opening chat does not immediately raise the keyboard.
      (window.matchMedia('(max-width: 520px)').matches ? close : textarea).focus({ preventScroll: true });
    } else {
      shieldObserver.disconnect();
      if (shieldFrame) cancelAnimationFrame(shieldFrame);
      shieldFrame = 0;
      for (const [element, previous] of suppressed) {
        if (previous === null) element.removeAttribute('data-stb-chat-suppressed');
        else element.setAttribute('data-stb-chat-suppressed', previous);
      }
      suppressed.clear();
      shieldStyle.remove();
      try { panel.hidePopover?.(); } catch { /* No active popover. */ }
      launch.focus({ preventScroll: true });
    }
  }
  launch.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  close.addEventListener('click', () => setOpen(false));

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
        !event.shiftKey &&
        !event.isComposing
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
