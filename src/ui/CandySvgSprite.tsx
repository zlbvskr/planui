import React from "react";

import { CANONICAL_ICON3D_KEYS } from "./Icon3D";

import { renderIcon3DGlyph } from "./iconGlyphs";

export const CandySvgSprite = React.memo(function CandySvgSprite() {
  return (
    <svg
      id="planui-candy-svg-sprite"
      aria-hidden="true"
      width="0"
      height="0"
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <defs>
        <linearGradient
          id="cb-pink"
          x1="16"
          y1="14"
          x2="72"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgb(255, 133, 194)" />
          <stop offset="52%" stopColor="rgb(255, 79, 163)" />
          <stop offset="100%" stopColor="rgb(224, 58, 136)" />
        </linearGradient>
        <linearGradient
          id="cb-yellow"
          x1="16"
          y1="14"
          x2="72"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgb(255, 220, 133)" />
          <stop offset="52%" stopColor="rgb(255, 200, 74)" />
          <stop offset="100%" stopColor="rgb(230, 175, 50)" />
        </linearGradient>
        <linearGradient
          id="cb-purple"
          x1="16"
          y1="14"
          x2="72"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgb(200, 165, 255)" />
          <stop offset="52%" stopColor="rgb(172, 123, 250)" />
          <stop offset="100%" stopColor="rgb(139, 92, 224)" />
        </linearGradient>
        <linearGradient
          id="cb-mint"
          x1="16"
          y1="14"
          x2="72"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgb(107, 232, 190)" />
          <stop offset="52%" stopColor="rgb(51, 213, 160)" />
          <stop offset="100%" stopColor="rgb(30, 184, 133)" />
        </linearGradient>
        <linearGradient
          id="cb-blue"
          x1="16"
          y1="14"
          x2="72"
          y2="78"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgb(153, 212, 255)" />
          <stop offset="52%" stopColor="rgb(101, 191, 255)" />
          <stop offset="100%" stopColor="rgb(69, 159, 224)" />
        </linearGradient>
        <linearGradient
          id="cb-spec"
          x1="44"
          y1="16"
          x2="44"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.72)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.04)" />
        </linearGradient>
        <linearGradient
          id="i3d-spec"
          x1="20"
          y1="3"
          x2="20"
          y2="18"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.72)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.02)" />
        </linearGradient>
        <linearGradient
          id="i3d-glyph"
          x1="12"
          y1="10"
          x2="28"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgb(255, 255, 255)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.88)" />
        </linearGradient>
        <linearGradient id="cb-ring-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#D5CFE6" />
          <stop offset="100%" stopColor="#9E98B8" />
        </linearGradient>
        <linearGradient id="cb-paper-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F5F2FA" />
        </linearGradient>
        <linearGradient id="cb-gold-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFEAA7" />
          <stop offset="50%" stopColor="#FFC84A" />
          <stop offset="100%" stopColor="#E69F22" />
        </linearGradient>
        <radialGradient id="cb-shadow-pink" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(224, 58, 136, 0.35)" />
          <stop offset="100%" stopColor="rgba(224, 58, 136, 0)" />
        </radialGradient>
        <radialGradient id="cb-shadow-yellow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(230, 175, 50, 0.35)" />
          <stop offset="100%" stopColor="rgba(230, 175, 50, 0)" />
        </radialGradient>
        <radialGradient id="cb-shadow-purple" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(139, 92, 224, 0.35)" />
          <stop offset="100%" stopColor="rgba(139, 92, 224, 0)" />
        </radialGradient>
        <radialGradient id="cb-shadow-neutral" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(120, 100, 170, 0.28)" />
          <stop offset="100%" stopColor="rgba(120, 100, 170, 0)" />
        </radialGradient>
        <filter
          id="candy-soft-gloss"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
        >
          <feSpecularLighting
            surfaceScale="2"
            specularConstant="0.4"
            specularExponent="18"
            lightingColor="#ffffff"
            result="spec"
          >
            <fePointLight x="20" y="8" z="28" />
          </feSpecularLighting>
          <feComposite
            in="spec"
            in2="SourceAlpha"
            operator="in"
            result="specMask"
          />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="specMask" />
          </feMerge>
        </filter>
      </defs>

      <symbol id="i3d-tile-squircle" viewBox="0 0 40 40">
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="12.5"
          fill="currentColor"
        />
        <rect
          x="2.5"
          y="2.5"
          width="35"
          height="35"
          rx="12"
          fill="none"
          stroke="rgba(255, 255, 255, 0.78)"
          strokeWidth="1"
        />
        <path
          d="M8 36.2 H32"
          stroke="rgba(40, 20, 80, 0.16)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <rect
          x="7"
          y="4.5"
          width="26"
          height="7"
          rx="3.5"
          fill="url(#i3d-spec)"
        />
      </symbol>

      <symbol id="i3d-tile-circle" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="currentColor" />
        <circle
          cx="20"
          cy="20"
          r="17.5"
          fill="none"
          stroke="rgba(255, 255, 255, 0.78)"
          strokeWidth="1"
        />
        <rect x="9" y="5" width="22" height="6" rx="3" fill="url(#i3d-spec)" />
      </symbol>

      {CANONICAL_ICON3D_KEYS.map((key) => (
        <symbol key={key} id={`i3d-glyph-${key}`} viewBox="0 0 40 40">
          {renderIcon3DGlyph(key, "url(#i3d-glyph)")}
        </symbol>
      ))}

      <symbol id="cb-sparkles" viewBox="0 0 88 88">
        <g stroke="var(--color-yellow)" strokeWidth="3.6" strokeLinecap="round">
          <line x1="70" y1="18" x2="78" y2="14" />
          <line x1="73" y1="26" x2="82" y2="28" />
        </g>
      </symbol>

      {/* Сьогодні: pink calendar with TWO binder rings and a mint check */}
      <symbol id="cb-shape-today" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse cx="44" cy="74" rx="24" ry="5.5" fill="url(#cb-shadow-pink)" />
        <rect
          x="18"
          y="24"
          width="52"
          height="47"
          rx="16"
          fill="url(#cb-pink)"
        />
        <rect
          x="19"
          y="25"
          width="50"
          height="45"
          rx="15"
          fill="none"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth="1.5"
        />
        <rect
          x="26"
          y="26.5"
          width="36"
          height="4"
          rx="2"
          fill="url(#cb-spec)"
        />
        <rect
          x="23"
          y="36"
          width="42"
          height="31"
          rx="10"
          fill="url(#cb-paper-grad)"
        />
        <rect x="24" y="37" width="40" height="2" rx="1" fill="#FFFFFF" />
        <line
          x1="26"
          y1="66"
          x2="62"
          y2="66"
          stroke="rgba(160, 140, 190, 0.25)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Ring 1 (left) */}
        <rect
          x="29"
          y="17"
          width="7"
          height="15"
          rx="3.5"
          fill="url(#cb-ring-metal)"
        />
        <rect
          x="30.5"
          y="20.5"
          width="4"
          height="8"
          rx="2"
          fill="rgba(80, 50, 100, 0.25)"
        />
        <rect
          x="30"
          y="18"
          width="2"
          height="13"
          rx="1"
          fill="#FFFFFF"
          opacity="0.8"
        />
        {/* Ring 2 (right) */}
        <rect
          x="52"
          y="17"
          width="7"
          height="15"
          rx="3.5"
          fill="url(#cb-ring-metal)"
        />
        <rect
          x="53.5"
          y="20.5"
          width="4"
          height="8"
          rx="2"
          fill="rgba(80, 50, 100, 0.25)"
        />
        <rect
          x="53"
          y="18"
          width="2"
          height="13"
          rx="1"
          fill="#FFFFFF"
          opacity="0.8"
        />
        {/* Mint checkmark with shadow and highlight */}
        <path
          d="M33 52.5 L40.5 60 L55.5 43.5"
          fill="none"
          stroke="rgba(20, 120, 90, 0.22)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M33 51 L40.5 58.5 L55.5 42"
          fill="none"
          stroke="url(#cb-mint)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M33.5 50 L40.5 57 L54.5 41"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
      </symbol>

      {/* Calendar window: pink calendar with TWO binder rings + paper sheet for today's number */}
      <symbol id="cb-shape-calendar" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse cx="44" cy="74" rx="24" ry="5.5" fill="url(#cb-shadow-pink)" />
        <rect
          x="18"
          y="24"
          width="52"
          height="47"
          rx="16"
          fill="url(#cb-pink)"
        />
        <rect
          x="19"
          y="25"
          width="50"
          height="45"
          rx="15"
          fill="none"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth="1.5"
        />
        <rect
          x="26"
          y="26.5"
          width="36"
          height="4"
          rx="2"
          fill="url(#cb-spec)"
        />
        <rect
          x="23"
          y="36"
          width="42"
          height="31"
          rx="10"
          fill="url(#cb-paper-grad)"
        />
        <rect x="24" y="37" width="40" height="2" rx="1" fill="#FFFFFF" />
        <line
          x1="26"
          y1="66"
          x2="62"
          y2="66"
          stroke="rgba(160, 140, 190, 0.25)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Ring 1 (left) */}
        <rect
          x="29"
          y="17"
          width="7"
          height="15"
          rx="3.5"
          fill="url(#cb-ring-metal)"
        />
        <rect
          x="30.5"
          y="20.5"
          width="4"
          height="8"
          rx="2"
          fill="rgba(80, 50, 100, 0.25)"
        />
        <rect
          x="30"
          y="18"
          width="2"
          height="13"
          rx="1"
          fill="#FFFFFF"
          opacity="0.8"
        />
        {/* Ring 2 (right) */}
        <rect
          x="52"
          y="17"
          width="7"
          height="15"
          rx="3.5"
          fill="url(#cb-ring-metal)"
        />
        <rect
          x="53.5"
          y="20.5"
          width="4"
          height="8"
          rx="2"
          fill="rgba(80, 50, 100, 0.25)"
        />
        <rect
          x="53"
          y="18"
          width="2"
          height="13"
          rx="1"
          fill="#FFFFFF"
          opacity="0.8"
        />
      </symbol>

      {/* Проєкти: yellow folder with colored papers */}
      <symbol id="cb-shape-projects" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse
          cx="44"
          cy="74"
          rx="25"
          ry="5.5"
          fill="url(#cb-shadow-yellow)"
        />
        <path
          d="M17 31C17 26.6 20.6 23 25 23H37C39.4 23 41.7 24.1 43.2 26L45.6 29H63C67.4 29 71 32.6 71 37V60C71 65.5 66.5 70 61 70H27C21.5 70 17 65.5 17 60V31Z"
          fill="url(#cb-yellow)"
        />
        <rect
          x="23"
          y="27"
          width="19"
          height="18"
          rx="4"
          transform="rotate(-7 23 27)"
          fill="url(#cb-pink)"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1"
        />
        <rect
          x="35"
          y="24"
          width="18"
          height="19"
          rx="4"
          transform="rotate(3 35 24)"
          fill="url(#cb-mint)"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1"
        />
        <rect
          x="47"
          y="28"
          width="18"
          height="17"
          rx="4"
          transform="rotate(9 47 28)"
          fill="url(#cb-blue)"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1"
        />
        <rect
          x="17"
          y="37"
          width="54"
          height="33"
          rx="13"
          fill="url(#cb-yellow)"
        />
        <rect
          x="18"
          y="38"
          width="52"
          height="31"
          rx="12"
          fill="none"
          stroke="rgba(255, 255, 255, 0.75)"
          strokeWidth="1.5"
        />
        <rect
          x="24"
          y="40"
          width="40"
          height="5"
          rx="2.5"
          fill="url(#cb-spec)"
        />
      </symbol>

      {/* Цілі: pink target with a mint arrow */}
      <symbol id="cb-shape-goals" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse cx="44" cy="74" rx="22" ry="5.5" fill="url(#cb-shadow-pink)" />
        <circle cx="44" cy="48" r="26" fill="url(#cb-pink)" />
        <circle
          cx="44"
          cy="48"
          r="25"
          fill="none"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth="1.5"
        />
        <path
          d="M27 36 A 21 21 0 0 1 53 27"
          fill="none"
          stroke="rgba(255, 255, 255, 0.65)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="44" cy="48" r="18" fill="url(#cb-paper-grad)" />
        <circle
          cx="44"
          cy="48"
          r="18"
          fill="none"
          stroke="rgba(224, 58, 136, 0.15)"
          strokeWidth="1"
        />
        <circle cx="44" cy="48" r="11" fill="url(#cb-pink)" />
        <circle
          cx="44"
          cy="48"
          r="10.5"
          fill="none"
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth="1"
        />
        <circle cx="44" cy="48" r="5" fill="url(#cb-yellow)" />
        <circle cx="42.8" cy="46.8" r="1.5" fill="#FFFFFF" opacity="0.8" />
        {/* Mint arrow */}
        <path
          d="M67 26.5 L46 47.5"
          stroke="rgba(20, 100, 80, 0.28)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d="M66 25 L45 46"
          stroke="url(#cb-mint)"
          strokeWidth="4.8"
          strokeLinecap="round"
        />
        <path
          d="M65 24 L46 43"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.8"
        />
        <polygon
          points="44,48 45,39 53,47"
          fill="url(#cb-mint)"
          stroke="rgba(255, 255, 255, 0.8)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M62 21 L67 21 L65 26"
          fill="none"
          stroke="url(#cb-mint)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M69 28 L69 23 L64 25"
          fill="none"
          stroke="url(#cb-mint)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </symbol>

      {/* Я: purple heart */}
      <symbol id="cb-shape-me" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse
          cx="44"
          cy="74"
          rx="20"
          ry="5.5"
          fill="url(#cb-shadow-purple)"
        />
        <path
          d="M44 71C42.3 71 40.6 70.4 39.2 69.2C27.6 59.5 18 50.2 18 38.2C18 29.6 24.8 23 33.2 23C37.9 23 41.8 25.2 44 28.6C46.2 25.2 50.1 23 54.8 23C63.2 23 70 29.6 70 38.2C70 50.2 60.4 59.5 48.8 69.2C47.4 70.4 45.7 71 44 71Z"
          fill="url(#cb-purple)"
        />
        <path
          d="M21 37C21 30.5 26.2 25 33 25C37.5 25 41 27.5 43 31"
          fill="none"
          stroke="rgba(255, 255, 255, 0.82)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M45 31C47 27.5 50.5 25 55 25C61.8 25 67 30.5 67 37"
          fill="none"
          stroke="rgba(255, 255, 255, 0.58)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M25 34C27 29.5 31 27.5 36 28"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.72"
        />
      </symbol>

      {/* Список бажань: pink gift box with a bow */}
      <symbol id="cb-shape-wishlist" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse cx="44" cy="74" rx="24" ry="5.5" fill="url(#cb-shadow-pink)" />
        {/* Box base */}
        <rect
          x="20"
          y="38"
          width="48"
          height="33"
          rx="10"
          fill="url(#cb-pink)"
        />
        <rect
          x="21"
          y="39"
          width="46"
          height="31"
          rx="9"
          fill="none"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="1.2"
        />
        {/* Box lid */}
        <rect
          x="17"
          y="31"
          width="54"
          height="12"
          rx="6"
          fill="url(#cb-pink)"
        />
        <rect
          x="18"
          y="32"
          width="52"
          height="3"
          rx="1.5"
          fill="#FFFFFF"
          opacity="0.75"
        />
        {/* Gold ribbons */}
        <rect
          x="40.5"
          y="31"
          width="7"
          height="40"
          fill="url(#cb-gold-ribbon)"
        />
        <rect
          x="41.5"
          y="31"
          width="2"
          height="40"
          fill="#FFFFFF"
          opacity="0.6"
        />
        <rect x="20" y="50" width="48" height="6" fill="url(#cb-gold-ribbon)" />
        <rect
          x="20"
          y="50.5"
          width="48"
          height="1.8"
          fill="#FFFFFF"
          opacity="0.6"
        />
        {/* Bow loops */}
        <ellipse
          cx="36"
          cy="24"
          rx="7.5"
          ry="5"
          transform="rotate(-26 36 24)"
          fill="url(#cb-gold-ribbon)"
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth="1"
        />
        <ellipse
          cx="52"
          cy="24"
          rx="7.5"
          ry="5"
          transform="rotate(26 52 24)"
          fill="url(#cb-gold-ribbon)"
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth="1"
        />
        <circle
          cx="44"
          cy="27"
          r="4.5"
          fill="url(#cb-gold-ribbon)"
          stroke="rgba(255, 255, 255, 0.75)"
          strokeWidth="1"
        />
        <circle cx="42.5" cy="25.5" r="1.5" fill="#FFFFFF" opacity="0.85" />
      </symbol>

      {/* Статистика: colorful bar chart */}
      <symbol id="cb-shape-stats" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse
          cx="44"
          cy="74"
          rx="25"
          ry="5.5"
          fill="url(#cb-shadow-neutral)"
        />
        <rect
          x="18"
          y="24"
          width="52"
          height="47"
          rx="16"
          fill="rgba(255, 255, 255, 0.92)"
          stroke="rgba(255, 255, 255, 0.8)"
          strokeWidth="1.5"
        />
        <line
          x1="22"
          y1="62"
          x2="66"
          y2="62"
          stroke="rgba(140, 120, 180, 0.18)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Bar 1 (pink) */}
        <rect
          x="25"
          y="42"
          width="10"
          height="20"
          rx="5"
          fill="url(#cb-pink)"
        />
        <rect
          x="26"
          y="43"
          width="8"
          height="6"
          rx="3"
          fill="#FFFFFF"
          opacity="0.6"
        />
        {/* Bar 2 (yellow) */}
        <rect
          x="39"
          y="32"
          width="10"
          height="30"
          rx="5"
          fill="url(#cb-yellow)"
        />
        <rect
          x="40"
          y="33"
          width="8"
          height="6"
          rx="3"
          fill="#FFFFFF"
          opacity="0.6"
        />
        {/* Bar 3 (mint) */}
        <rect
          x="53"
          y="22"
          width="10"
          height="40"
          rx="5"
          fill="url(#cb-mint)"
        />
        <rect
          x="54"
          y="23"
          width="8"
          height="6"
          rx="3"
          fill="#FFFFFF"
          opacity="0.6"
        />
      </symbol>

      {/* Налаштування: glossy gear */}
      <symbol id="cb-shape-settings" viewBox="0 0 88 88">
        <use href="#cb-sparkles" />
        <ellipse
          cx="44"
          cy="74"
          rx="22"
          ry="5.5"
          fill="url(#cb-shadow-purple)"
        />
        <g fill="url(#cb-purple)">
          <rect x="39" y="20" width="10" height="52" rx="4.5" />
          <rect
            x="39"
            y="20"
            width="10"
            height="52"
            rx="4.5"
            transform="rotate(45 44 46)"
          />
          <rect
            x="39"
            y="20"
            width="10"
            height="52"
            rx="4.5"
            transform="rotate(90 44 46)"
          />
          <rect
            x="39"
            y="20"
            width="10"
            height="52"
            rx="4.5"
            transform="rotate(135 44 46)"
          />
          <circle cx="44" cy="46" r="21" />
        </g>
        <circle
          cx="44"
          cy="46"
          r="20.5"
          fill="none"
          stroke="rgba(255, 255, 255, 0.68)"
          strokeWidth="1.5"
        />
        <circle cx="44" cy="46" r="14" fill="url(#cb-blue)" />
        <circle
          cx="44"
          cy="46"
          r="13.5"
          fill="none"
          stroke="rgba(255, 255, 255, 0.5)"
          strokeWidth="1"
        />
        <circle cx="44" cy="46" r="7" fill="#FFFFFF" />
        <circle
          cx="44"
          cy="46"
          r="6.5"
          fill="none"
          stroke="rgba(100, 80, 150, 0.2)"
          strokeWidth="1"
        />
        <path
          d="M31 37 A 16 16 0 0 1 51 31"
          fill="none"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </symbol>
    </svg>
  );
});
