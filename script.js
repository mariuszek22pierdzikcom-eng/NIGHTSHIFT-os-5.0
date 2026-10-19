
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const apps = {
    control: { title: "Control Center", icon: "◈" },
    terminal: { title: "Terminal PRO", icon: "⌘" },
    notes: { title: "Notes 2.0", icon: "▤" },
    files: { title: "File Explorer", icon: "▧" },
    settings: { title: "Personalization", icon: "⚙" },
    about: { title: "About NIGHTSHIFT", icon: "NΩ" }
  };

  const windows = new Map(
    $$(".window").map(windowEl => [windowEl.dataset.app, windowEl])
  );

  const minimized = new Set();
  const sessionStart = Date.now();

  let zIndex = 21;
  let soundEnabled = false;
  let audioContext = null;
  let history = [];
  let historyPosition = 0;
  let noteTimer = null;

  const terminalOutput = $("#terminal-output");
  const terminalInput = $("#terminal-input");

  // STORAGE

  function getSetting(key, fallback = "") {
    try {
      return localStorage.getItem("ns50-" + key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveSetting(key, value) {
    try {
      localStorage.setItem("ns50-" + key, value);
      return true;
    } catch {
      return false;
    }
  }

  // SOUND EFFECTS

  function beep(frequency = 520, duration = 0.04) {
    if (!soundEnabled) return;

    try {
      audioContext ||= new (
        window.AudioContext || window.webkitAudioContext
      )();

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = 0.025;

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration
      );

      oscillator.stop(audioContext.currentTime + duration);
    } catch {
      // Audio is optional.
    }
  }

  // NOTIFICATIONS

  function toast(title, message) {
    const item = document.createElement("div");
    item.className = "toast";

    const heading = document.createElement("b");
    heading.textContent = title;

    const body = document.createElement("span");
    body.textContent = message;

    item.append(heading, body);
    $("#toast-stack").append(item);

    setTimeout(() => item.remove(), 3500);
  }

  // WINDOW MANAGEMENT

  function setActiveDock(appId) {
    $$(".dock button[data-open]").forEach(button => {
      button.classList.toggle("active", button.dataset.open === appId);
    });
  }

  function updateTaskbar() {
    const taskbar = $("#taskbar-apps");
    taskbar.replaceChildren();

    for (const [appId, windowEl] of windows) {
      if (!windowEl.classList.contains("open")) continue;

      const button = document.createElement("button");
      button.className = "task-app";

      if (windowEl.classList.contains("focused") && !minimized.has(appId)) {
        button.classList.add("active");
      }

      const icon = document.createElement("i");
      icon.textContent = apps[appId].icon;

      const label = document.createElement("span");
      label.textContent = apps[appId].title;

      button.append(icon, label);

      button.addEventListener("click", () => {
        if (minimized.has(appId)) {
          focusWindow(appId);
        } else if (windowEl.classList.contains("focused")) {
          minimizeApp(appId);
        } else {
          focusWindow(appId);
        }
      });

      taskbar.append(button);
    }
  }

  function focusWindow(appId) {
    const windowEl = windows.get(appId);
    if (!windowEl) return;

    minimized.delete(appId);
    windowEl.classList.add("open");
    windowEl.style.zIndex = ++zIndex;

    windows.forEach((otherWindow, otherId) => {
      otherWindow.classList.toggle("focused", otherId === appId);
    });

    setActiveDock(appId);
    updateTaskbar();

    if (appId === "terminal") {
      setTimeout(() => terminalInput.focus(), 50);
    }
  }

  function openApp(appId) {
    if (!windows.has(appId)) return;

    focusWindow(appId);
    $("#start-menu").classList.add("hidden");
    beep(620);
  }

  function closeApp(appId) {
    const windowEl = windows.get(appId);
    if (!windowEl) return;

    windowEl.classList.remove("open", "focused", "maximized");
    minimized.delete(appId);

    const next = [...windows.entries()]
      .reverse()
      .find(([id, other]) =>
        id !== appId &&
        other.classList.contains("open") &&
        !minimized.has(id)
      );

    if (next) {
      focusWindow(next[0]);
    } else {
      setActiveDock("");
      updateTaskbar();
    }

    beep(340);
  }

  function minimizeApp(appId) {
    const windowEl = windows.get(appId);
    if (!windowEl) return;

    windowEl.classList.remove("focused");
    minimized.add(appId);

    const next = [...windows.entries()]
      .reverse()
      .find(([id, other]) =>
        id !== appId &&
        other.classList.contains("open") &&
        !minimized.has(id)
      );

    if (next) {
      focusWindow(next[0]);
    } else {
      setActiveDock("");
      updateTaskbar();
    }

    beep(390);
  }

  function maximizeApp(appId) {
    const windowEl = windows.get(appId);
    if (!windowEl) return;

    if (!windowEl.classList.contains("maximized")) {
      windowEl.dataset.previousStyle = [
        windowEl.style.left,
        windowEl.style.top,
        windowEl.style.width,
        windowEl.style.height
      ].join("|");

      windowEl.classList.add("maximized");
    } else {
      windowEl.classList.remove("maximized");

      const previous = (windowEl.dataset.previousStyle || "").split("|");

      [
        windowEl.style.left,
        windowEl.style.top,
        windowEl.style.width,
        windowEl.style.height
      ] = previous;
    }

    focusWindow(appId);
  }

  $$("[data-open]").forEach(button => {
    button.addEventListener("click", () => openApp(button.dataset.open));
  });

  $$("[data-close]").forEach(button => {
    button.addEventListener("click", () => closeApp(button.dataset.close));
  });

  $$("[data-minimize]").forEach(button => {
    button.addEventListener("click", () => minimizeApp(button.dataset.minimize));
  });

  $$("[data-maximize]").forEach(button => {
    button.addEventListener("click", () => maximizeApp(button.dataset.maximize));
  });

  // DRAGGABLE WINDOWS

  windows.forEach((windowEl, appId) => {
    windowEl.addEventListener("pointerdown", () => {
      if (windowEl.classList.contains("open")) focusWindow(appId);
    });

    const header = $(".window-head", windowEl);

    header.addEventListener("pointerdown", event => {
      if (
        event.target.closest(".window-controls") ||
        windowEl.classList.contains("maximized") ||
        event.button !== 0
      ) return;

      focusWindow(appId);

      const startX = event.clientX;
      const startY = event.clientY;
      const initialRect = windowEl.getBoundingClientRect();
      const desktopRect = $("#desktop").getBoundingClientRect();

      function moveWindow(moveEvent) {
        const maxLeft = Math.max(
          0,
          desktopRect.width - windowEl.offsetWidth
        );

        const maxTop = Math.max(
          62,
          desktopRect.height - 55 - windowEl.offsetHeight
        );

        const left = Math.max(
          0,
          Math.min(
            maxLeft,
            initialRect.left - desktopRect.left +
              moveEvent.clientX - startX
          )
        );

        const top = Math.max(
          62,
          Math.min(
            maxTop,
            initialRect.top - desktopRect.top +
              moveEvent.clientY - startY
          )
        );

        windowEl.style.left = `${left}px`;
        windowEl.style.top = `${top}px`;
      }

      function stopMoving() {
        window.removeEventListener("pointermove", moveWindow);
        window.removeEventListener("pointerup", stopMoving);
      }

      window.addEventListener("pointermove", moveWindow);
      window.addEventListener("pointerup", stopMoving, { once: true });

      event.preventDefault();
    });
  });

  // START MENU

  const startMenu = $("#start-menu");

  function toggleStartMenu() {
    startMenu.classList.toggle("hidden");
    beep(500);
  }

  $("#start-button").addEventListener("click", toggleStartMenu);
  $("#taskbar-start").addEventListener("click", toggleStartMenu);

  document.addEventListener("pointerdown", event => {
    if (
      !startMenu.classList.contains("hidden") &&
      !event.target.closest("#start-menu") &&
      !event.target.closest("#start-button") &&
      !event.target.closest("#taskbar-start")
    ) {
      startMenu.classList.add("hidden");
    }
  });

  $("#restart-ui").addEventListener("click", () => {
    startMenu.classList.add("hidden");
    openApp("control");
    toast("Interface refreshed", "Your local preferences are still saved.");
  });

  $("#taskbar-settings").addEventListener("click", () => openApp("settings"));

  // CLOCK AND BROWSER INFORMATION

  function updateClock() {
    const now = new Date();

    const time = now.toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    const shortTime = now.toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit"
    });

    $("#top-clock").textContent = time;
    $("#taskbar-clock").textContent = shortTime;
    $("#stat-time").textContent = shortTime;

    $("#big-clock").innerHTML =
      `${shortTime.slice(0, 2)}<span>:</span>${shortTime.slice(3, 5)}`;

    $("#desktop-date").textContent =
      now.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long"
      }).toUpperCase();

    $("#taskbar-date").textContent =
      now.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });

    const seconds = Math.floor((Date.now() - sessionStart) / 1000);
    const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secondsText = String(seconds % 60).padStart(2, "0");

    $("#session-time").textContent = `${minutesText}:${secondsText}`;
  }

  function detectBrowser() {
    const ua = navigator.userAgent;

    let name = "Browser";

    if (ua.includes("Edg/")) name = "Edge";
    else if (ua.includes("Chrome/")) name = "Chrome";
    else if (ua.includes("Firefox/")) name = "Firefox";
    else if (ua.includes("Safari/")) name = "Safari";

    $("#browser-name").textContent = name;

    try {
      localStorage.setItem("__ns_test", "1");
      localStorage.removeItem("__ns_test");
      $("#storage-status").textContent = "Ready";
    } catch {
      $("#storage-status").textContent = "Blocked";
    }
  }

  updateClock();
  detectBrowser();
  setInterval(updateClock, 1000);

  // SIMULATED DASHBOARD CHARTS

  const cpuHistory = [];
  const ramHistory = [];

  function renderSparkline(selector, values) {
    const container = $(selector);
    container.replaceChildren();

    values.forEach(value => {
      const bar = document.createElement("i");
      bar.style.height = `${Math.max(8, value * 0.72)}%`;
      container.append(bar);
    });
  }

  function updateTelemetry() {
    const cpu = Math.floor(18 + Math.random() * 57);
    const ram = Math.floor(31 + Math.random() * 43);

    $("#cpu-value").textContent = `${cpu}%`;
    $("#ram-value").textContent = `${ram}%`;

    $("#cpu-meter").style.width = `${cpu}%`;
    $("#ram-meter").style.width = `${ram}%`;

    cpuHistory.push(cpu);
    ramHistory.push(ram);

    if (cpuHistory.length > 22) cpuHistory.shift();
    if (ramHistory.length > 22) ramHistory.shift();

    renderSparkline("#cpu-spark", cpuHistory);
    renderSparkline("#ram-spark", ramHistory);
  }

  updateTelemetry();
  setInterval(updateTelemetry, 2600);

  // TERMINAL OUTPUT

  function printLine(message, type = "") {
    const line = document.createElement("div");
    line.className = "term-line " + type;
    line.textContent = message;

    terminalOutput.append(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  function terminalWelcome() {
    printLine("NIGHTSHIFT OS [Version 5.0.0]", "system");
    printLine("OMEGA BLUE command interface initialized.", "muted");
    printLine("This is an app terminal, not a Windows shell.", "muted");
    printLine("Type 'help' to list available commands.", "success");
    printLine("");
  }

  // A small arithmetic parser, limited to numbers and arithmetic operators.
  function calculate(expression) {
    const tokens = expression.match(
      /\d+(?:\.\d+)?|[()+\-*/%]/g
    );

    if (!tokens || tokens.join("") !== expression.replace(/\s/g, "")) {
      throw new Error("Invalid expression");
    }

    let position = 0;

    function parseExpression() {
      let value = parseTerm();

      while (tokens[position] === "+" || tokens[position] === "-") {
        const operator = tokens[position++];
        const right = parseTerm();
        value = operator === "+" ? value + right : value - right;
      }

      return value;
    }

    function parseTerm() {
      let value = parseFactor();

      while (
        tokens[position] === "*" ||
        tokens[position] === "/" ||
        tokens[position] === "%"
      ) {
        const operator = tokens[position++];
        const right = parseFactor();

        if ((operator === "/" || operator === "%") && right === 0) {
          throw new Error("Division by zero");
        }

        if (operator === "*") value *= right;
        if (operator === "/") value /= right;
        if (operator === "%") value %= right;
      }

      return value;
    }

    function parseFactor() {
      if (tokens[position] === "-") {
        position++;
        return -parseFactor();
      }

      if (tokens[position] === "+") {
        position++;
        return parseFactor();
      }

      if (tokens[position] === "(") {
        position++;
        const value = parseExpression();

        if (tokens[position++] !== ")") {
          throw new Error("Missing closing parenthesis");
        }

        return value;
      }

      const token = tokens[position++];

      if (!token || !/^\d+(?:\.\d+)?$/.test(token)) {
        throw new Error("Expected a number");
      }

      return Number(token);
    }

    const result = parseExpression();

    if (position !== tokens.length || !Number.isFinite(result)) {
      throw new Error("Invalid result");
    }

    return result;
  }

  function runCommand(raw) {
    const input = raw.trim();
    if (!input) return;

    printLine("operator@omega › " + input, "system");

    const firstSpace = input.indexOf(" ");
    const command = (
      firstSpace === -1 ? input : input.slice(0, firstSpace)
    ).toLowerCase();

    const argument = firstSpace === -1
      ? ""
      : input.slice(firstSpace + 1).trim();

    switch (command) {
      case "help":
        [
          "AVAILABLE COMMANDS",
          "  help                         Show commands",
          "  clear                        Clear terminal",
          "  date / time                  Show local date or time",
          "  whoami                       Show session identity",
          "  neofetch                     Show system card",
          "  sysinfo                      Show browser information",
          "  echo <text>                  Print text",
          "  theme blue|cyan|violet|pink  Change accent color",
          "  open <app>                   Open an application",
          "  notify <text>                Show a notification",
          "  calc <expression>            Calculate arithmetic",
          "  uptime                       Show session duration",
          "  version                      Show version",
          "  sound on|off                 Toggle sound",
          "  notes                        Open Notes",
          "  about                        Open About"
        ].forEach(line =>
          printLine(line, line === "AVAILABLE COMMANDS" ? "success" : "")
        );
        break;

      case "clear":
        terminalOutput.replaceChildren();
        break;

      case "date":
        printLine(
          new Date().toLocaleDateString("pl-PL", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
          }),
          "success"
        );
        break;

      case "time":
        printLine(new Date().toLocaleTimeString("pl-PL"), "success");
        break;

      case "whoami":
        printLine("operator@nightshift.local | LOCAL BROWSER SESSION", "success");
        break;

      case "version":
        printLine("NIGHTSHIFT OS 5.0.0 / OMEGA BLUE / WEB DESKTOP", "success");
        break;

      case "uptime": {
        const seconds = Math.floor((Date.now() - sessionStart) / 1000);
        printLine(`${Math.floor(seconds / 60)}m ${seconds % 60}s since launch`, "success");
        break;
      }

      case "echo":
        printLine(argument);
        break;

      case "neofetch":
        [
          "       NΩ       NIGHTSHIFT OS 5.0",
          "     /████\\     OMEGA BLUE EDITION",
          "    /██████\\    ───────────────────",
          "    Browser     " + $("#browser-name").textContent,
          "    Runtime     HTML / CSS / JavaScript",
          "    Session     Local browser session",
          "    Status      OPERATIONAL"
        ].forEach((line, index) =>
          printLine(line, index === 0 || index === 6 ? "success" : "")
        );
        break;

      case "sysinfo":
        printLine("Browser: " + navigator.userAgent);
        printLine("Platform: " + (navigator.userAgentData?.platform || navigator.platform || "Unknown"));
        printLine("Language: " + navigator.language);
        printLine("Screen: " + screen.width + " × " + screen.height);
        printLine("Browser online status: " + (navigator.onLine ? "online" : "offline"));
        printLine("CPU/RAM system metrics are not exposed to this page.", "muted");
        break;

      case "theme": {
        const themes = ["blue", "cyan", "violet", "pink"];

        if (!themes.includes(argument.toLowerCase())) {
          printLine("Usage: theme blue|cyan|violet|pink", "error");
          break;
        }

        applyTheme(argument.toLowerCase());
        printLine("Accent theme changed to " + argument + ".", "success");
        break;
      }

      case "open": {
        const aliases = {
          home: "control",
          "control center": "control",
          "terminal pro": "terminal",
          "file explorer": "files",
          "notes 2.0": "notes",
          personalization: "settings",
          settings: "settings",
          about: "about"
        };

        const appId = aliases[argument.toLowerCase()] || argument.toLowerCase();

        if (windows.has(appId)) {
          openApp(appId);
          printLine("Opening " + apps[appId].title + "...", "success");
        } else {
          printLine("Unknown app. Try: control, terminal, notes, files, settings, about", "error");
        }
        break;
      }

      case "notes":
        openApp("notes");
        printLine("Opening Notes 2.0...", "success");
        break;

      case "about":
        openApp("about");
        printLine("Opening system information...", "success");
        break;

      case "notify":
        if (!argument) {
          printLine("Usage: notify <message>", "error");
        } else {
          toast("OMEGA notification", argument);
          printLine("Notification dispatched.", "success");
        }
        break;

      case "sound":
        if (argument === "on" || argument === "off") {
          setSound(argument === "on");
          printLine("Interface sound " + argument + ".", "success");
        } else {
          printLine("Usage: sound on|off", "error");
        }
        break;

      case "calc":
        try {
          printLine(String(calculate(argument)), "success");
        } catch {
          printLine("Invalid expression. Example: calc (12 + 4) * 2", "error");
        }
        break;

      default:
        printLine(`Command not found: ${command}. Type 'help'.`, "error");
    }

    printLine("");
  }

  $("#terminal-form").addEventListener("submit", event => {
    event.preventDefault();

    const value = terminalInput.value;

    if (value.trim()) {
      history.push(value);
      historyPosition = history.length;
      runCommand(value);
    }

    terminalInput.value = "";
    beep(720, 0.025);
  });

  terminalInput.addEventListener("keydown", event => {
    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (history.length) {
        historyPosition = Math.max(0, historyPosition - 1);
        terminalInput.value = history[historyPosition];
      }
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      historyPosition = Math.min(history.length, historyPosition + 1);
      terminalInput.value = history[historyPosition] || "";
    }
  });

  $("#clear-terminal").addEventListener("click", () => {
    terminalOutput.replaceChildren();
    printLine("Terminal cleared.", "muted");
    terminalInput.focus();
  });

  // NOTES WITH AUTOSAVE

  const noteTitle = $("#note-title");
  const noteContent = $("#note-content");

  noteTitle.value = getSetting("note-title");
  noteContent.value = getSetting("note-content");

  function updateNoteCount() {
    $("#note-count").textContent = noteContent.value.length + " characters";
  }

  function saveNote() {
    $("#note-save-state").textContent = "SAVING…";

    clearTimeout(noteTimer);

    noteTimer = setTimeout(() => {
      const successA = saveSetting("note-title", noteTitle.value);
      const successB = saveSetting("note-content", noteContent.value);

      $("#note-save-state").textContent =
        successA && successB ? "SAVED" : "NOT SAVED";

      updateNoteCount();
    }, 250);
  }

  noteTitle.addEventListener("input", saveNote);
  noteContent.addEventListener("input", saveNote);
  updateNoteCount();

  $("#clear-note").addEventListener("click", () => {
    if (!confirm("Clear the current note?")) return;

    noteTitle.value = "";
    noteContent.value = "";
    saveNote();

    toast("Note cleared", "The empty note will be saved locally.");
  });

  // FILE EXPLORER: ONLY USER-SELECTED FILES

  $("#file-input").addEventListener("change", event => {
    const files = [...event.target.files];
    const list = $("#file-list");
    const preview = $("#file-preview");

    list.replaceChildren();
    preview.replaceChildren();

    if (!files.length) {
      showEmptyFiles(list, "No files selected", "Choose files to preview them here.");
      return;
    }

    files.forEach((file, index) => {
      const button = document.createElement("button");
      button.className = "file-item";

      const icon = document.createElement("i");
      icon.textContent = "▤";

      const label = document.createElement("div");
      label.textContent = file.name;

      const size = document.createElement("small");
      size.textContent = formatBytes(file.size);

      label.append(size);
      button.append(icon, label);

      button.addEventListener("click", () => previewFile(file, button));
      list.append(button);

      if (index === 0) button.click();
    });

    toast("Files loaded", `${files.length} file(s) selected for preview.`);
  });

  function showEmptyFiles(container, title, description) {
    const state = document.createElement("div");
    state.className = "empty-state";

    const icon = document.createElement("b");
    icon.textContent = "▧";

    const heading = document.createElement("strong");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    state.append(icon, heading, paragraph);
    container.append(state);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function previewFile(file, button) {
    $$(".file-item").forEach(item => {
      item.classList.toggle("selected", item === button);
    });

    const preview = $("#file-preview");
    preview.replaceChildren();

    const heading = document.createElement("div");
    heading.style.color = "var(--cyan)";
    heading.style.marginBottom = "10px";
    heading.textContent = `${file.name} / ${formatBytes(file.size)}`;
    preview.append(heading);

    if (file.size > 1024 * 1024) {
      preview.append(document.createTextNode(
        "Preview limit is 1 MB. Select a smaller text file."
      ));
      return;
    }

    const textFile =
      /\.(txt|md|json|js|css|html|py|log|csv|xml|yml|yaml|ini|toml)$/i.test(file.name) ||
      file.type.startsWith("text/") ||
      file.type === "application/json";

    if (!textFile) {
      preview.append(document.createTextNode(
        "This file type is not displayed as text. File details are shown above."
      ));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const content = document.createElement("div");
      content.textContent = String(reader.result).slice(0, 30000);
      preview.append(content);
    };

    reader.onerror = () => {
      preview.append(document.createTextNode("Could not read this file."));
    };

    reader.readAsText(file);
  }

  // THEMES

  const themeColors = {
    blue: ["#55e7ff", "#388cff"],
    cyan: ["#73ffe3", "#00bcae"],
    violet: ["#c3a5ff", "#7865ff"],
    pink: ["#ff8bc8", "#ff4fa3"]
  };

  function applyTheme(theme) {
    const colors = themeColors[theme] || themeColors.blue;

    document.documentElement.style.setProperty("--cyan", colors[0]);
    document.documentElement.style.setProperty("--blue", colors[1]);

    $$(".swatch").forEach(button => {
      button.classList.toggle("selected", button.dataset.theme === theme);
    });

    saveSetting("theme", theme);
  }

  $$(".swatch").forEach(button => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.theme);
      toast("Theme updated", "Accent color changed to " + button.dataset.theme + ".");
      beep(640);
    });
  });

  // NEON INTENSITY

  const glowRange = $("#glow-range");
  glowRange.value = getSetting("glow", "72");

  document.documentElement.style.setProperty(
    "--glow",
    Number(glowRange.value) / 100
  );

  glowRange.addEventListener("input", () => {
    document.documentElement.style.setProperty(
      "--glow",
      Number(glowRange.value) / 100
    );

    saveSetting("glow", glowRange.value);
  });

  // REDUCED MOTION

  const motionToggle = $("#motion-toggle");
  motionToggle.checked = getSetting("motion", "off") === "on";

  document.body.classList.toggle("reduce-motion", motionToggle.checked);

  motionToggle.addEventListener("change", () => {
    document.body.classList.toggle("reduce-motion", motionToggle.checked);
    saveSetting("motion", motionToggle.checked ? "on" : "off");
  });

  // SOUND SETTINGS

  function setSound(enabled) {
    soundEnabled = enabled;

    $("#sound-toggle").classList.toggle("active", enabled);
    $("#settings-sound-toggle").checked = enabled;

    saveSetting("sound", enabled ? "on" : "off");

    if (enabled) beep(680, 0.05);
  }

  $("#sound-toggle").addEventListener("click", () => {
    setSound(!soundEnabled);
  });

  $("#settings-sound-toggle").addEventListener("change", event => {
    setSound(event.target.checked);
  });

  applyTheme(getSetting("theme", "blue"));
  setSound(getSetting("sound", "off") === "on");

  // BOOT SEQUENCE

  const bootMessages = [
    "Loading interface modules...",
    "Starting OMEGA workspace...",
    "Calibrating neon systems...",
    "Starting local session..."
  ];

  let bootStep = 0;

  const bootStatus = $("#boot-status");

  const bootTimer = setInterval(() => {
    bootStep++;
    bootStatus.textContent =
      bootMessages[Math.min(bootStep, bootMessages.length - 1)];

    if (bootStep >= bootMessages.length - 1) {
      clearInterval(bootTimer);

      setTimeout(() => {
        $("#boot").classList.add("hidden");
        $("#desktop").classList.remove("hidden");

        terminalWelcome();
        focusWindow("control");

        toast("NIGHTSHIFT OS 5.0", "OMEGA BLUE session is ready.");
      }, 350);
    }
  }, 360);
})();
