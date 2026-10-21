/* ==========================================================================
   Draw on Web — support site behaviour (vanilla JS, no dependencies)
   Handles: theme toggle + persistence, mobile menu, FAQ accordion,
   scroll-reveal, store/contact links, footer year.
   ========================================================================== */

/* --------------------------------------------------------------------------
   CONFIG — edit these three values after you publish / create your repo.
   Every "Add to Chrome", GitHub, and contact link on the site reads from here.
   -------------------------------------------------------------------------- */
window.DOW_CONFIG = {
  // Chrome Web Store listing URL (the live "Add to Chrome" target).
  storeUrl: "https://chromewebstore.google.com/detail/ahodmhekhpcglhflceahakgojleklenc",

  // Public GitHub repository (used for "Report a bug" / issues links).
  repoUrl: "https://github.com/MAYANKSANGWAN462/Draw-on-Web",

  // Support / privacy contact email.
  email: "sangwanmayank462@gmail.com",

  // Instagram profile (shown as a social icon in the footer).
  instagram: "https://www.instagram.com/mayanksangwan_77/",
};

(function () {
  "use strict";

  var cfg = window.DOW_CONFIG;

  /* ---- Theme: respect saved choice, else system preference -------------- */
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem("dow-theme"); } catch (e) {}
  var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", saved || (prefersDark ? "dark" : "light"));

  function toggleTheme() {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("dow-theme", next); } catch (e) {}
  }

  /* ---- Wire everything once the DOM is ready ---------------------------- */
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    // Theme toggle button(s)
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", toggleTheme);
    });

    // Mobile menu
    var menuBtn = document.querySelector("[data-menu-toggle]");
    var navLinks = document.getElementById("nav-links");
    if (menuBtn && navLinks) {
      menuBtn.addEventListener("click", function () {
        var open = navLinks.classList.toggle("open");
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      // Close the menu after tapping a link
      navLinks.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          navLinks.classList.remove("open");
          menuBtn.setAttribute("aria-expanded", "false");
        });
      });
    }

    // Apply config-driven links
    document.querySelectorAll("[data-store-link]").forEach(function (a) {
      a.setAttribute("href", cfg.storeUrl);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
    document.querySelectorAll("[data-repo-link]").forEach(function (a) {
      a.setAttribute("href", cfg.repoUrl);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
    document.querySelectorAll("[data-issues-link]").forEach(function (a) {
      a.setAttribute("href", cfg.repoUrl.replace(/\/$/, "") + "/issues");
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
    document.querySelectorAll("[data-email-link]").forEach(function (a) {
      a.setAttribute("href", "mailto:" + cfg.email);
      if (a.hasAttribute("data-email-text")) a.textContent = cfg.email;
    });
    document.querySelectorAll("[data-instagram-link]").forEach(function (a) {
      a.setAttribute("href", cfg.instagram);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });

    // FAQ accordion (one open at a time is not enforced — allow multiple)
    document.querySelectorAll(".faq-item").forEach(function (item) {
      var q = item.querySelector(".faq-q");
      var a = item.querySelector(".faq-a");
      if (!q || !a) return;
      q.addEventListener("click", function () {
        var isOpen = item.classList.toggle("open");
        q.setAttribute("aria-expanded", isOpen ? "true" : "false");
        a.style.maxHeight = isOpen ? a.scrollHeight + "px" : "0";
      });
    });

    // Scroll-reveal
    var reveals = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window && reveals.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("visible"); });
    }

    // Footer year
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  });
})();
