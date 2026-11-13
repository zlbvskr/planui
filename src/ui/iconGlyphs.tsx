import React from "react";

export function renderIcon3DGlyph(
  name: string,
  gradUrl: string,
): React.ReactNode {
  const n = name.trim().toLowerCase();
  switch (n) {
    case "check":
    case "task":
      return (
        <path
          d="M12.5 20.5L17.5 25.5L28 14.5"
          fill="none"
          stroke={gradUrl}
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "calendar":
    case "event":
      return (
        <g fill={gradUrl}>
          <rect x="10" y="13" width="20" height="17" rx="4.5" />
          <rect x="14" y="9.5" width="3" height="5.5" rx="1.5" />
          <rect x="23" y="9.5" width="3" height="5.5" rx="1.5" />
          <circle cx="15.5" cy="20.5" r="1.7" fill="rgba(18, 18, 22, 0.28)" />
          <circle cx="20" cy="20.5" r="1.7" fill="rgba(18, 18, 22, 0.28)" />
          <circle cx="24.5" cy="20.5" r="1.7" fill="rgba(18, 18, 22, 0.28)" />
          <circle cx="15.5" cy="25" r="1.7" fill="rgba(18, 18, 22, 0.28)" />
          <circle cx="20" cy="25" r="1.7" fill="rgba(18, 18, 22, 0.28)" />
        </g>
      );
    case "repeat":
    case "habit":
      return (
        <g
          fill="none"
          stroke={gradUrl}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 17C12 14.2 14.2 12 17 12H25.5" />
          <path d="M23 9.2L26.5 12L23 14.8" />
          <path d="M28 23C28 25.8 25.8 28 23 28H14.5" />
          <path d="M17 30.8L13.5 28L17 25.2" />
        </g>
      );
    case "folder":
    case "projects":
      return (
        <path
          d="M9.5 14.5C9.5 12.6 11 11 13 11H17.2C18.3 11 19.3 11.5 19.9 12.4L21 14H27C28.9 14 30.5 15.6 30.5 17.5V25.5C30.5 27.4 28.9 29 27 29H13C11 29 9.5 27.4 9.5 25.5V14.5Z"
          fill={gradUrl}
        />
      );
    case "target":
    case "goal":
    case "goals":
      return (
        <g>
          <circle
            cx="20"
            cy="20"
            r="10"
            fill="none"
            stroke={gradUrl}
            strokeWidth="3.2"
          />
          <circle
            cx="20"
            cy="20"
            r="5.2"
            fill="none"
            stroke={gradUrl}
            strokeWidth="2.8"
          />
          <circle cx="20" cy="20" r="2.2" fill={gradUrl} />
        </g>
      );
    case "heart":
    case "me":
      return (
        <path
          d="M20 29.2C19.3 29.2 18.6 28.9 18 28.4C13.2 24.4 10 21.1 10 16.9C10 13.7 12.5 11.2 15.6 11.2C17.5 11.2 19.1 12.1 20 13.5C20.9 12.1 22.5 11.2 24.4 11.2C27.5 11.2 30 13.7 30 16.9C30 21.1 26.8 24.4 22 28.4C21.4 28.9 20.7 29.2 20 29.2Z"
          fill={gradUrl}
        />
      );
    case "sun":
    case "shift-day":
      return (
        <g fill={gradUrl} stroke={gradUrl} strokeLinecap="round">
          <circle cx="20" cy="20" r="5.5" stroke="none" />
          <path
            d="M20 9.5V11.8M20 28.2V30.5M9.5 20H11.8M28.2 20H30.5M12.6 12.6L14.2 14.2M25.8 25.8L27.4 27.4M27.4 12.6L25.8 14.2M14.2 25.8L12.6 27.4"
            strokeWidth="2.8"
          />
        </g>
      );
    case "moon":
    case "shift-night":
      return (
        <path
          d="M25.8 24.8C20.6 24.8 16.4 20.6 16.4 15.4C16.4 13.5 17 11.7 18 10.3C13.6 11.1 10.2 15 10.2 19.7C10.2 25 14.5 29.3 19.8 29.3C23.8 29.3 27.2 26.9 28.7 23.4C27.8 24.3 26.8 24.8 25.8 24.8Z"
          fill={gradUrl}
        />
      );
    case "gift":
    case "wish":
    case "wishlist":
      return (
        <g fill={gradUrl}>
          <rect x="10.5" y="16" width="19" height="4.5" rx="2" />
          <path d="M12 21.5H18.5V29.5H14.5C13.1 29.5 12 28.4 12 27V21.5Z" />
          <path d="M21.5 21.5H28V27C28 28.4 26.9 29.5 25.5 29.5H21.5V21.5Z" />
          <path
            d="M20 16C17.2 16 14.5 14.2 14.5 12.2C14.5 10.8 15.7 9.8 17.2 9.8C18.8 9.8 20 11.8 20 16ZM20 16C22.8 16 25.5 14.2 25.5 12.2C25.5 10.8 24.3 9.8 22.8 9.8C21.2 9.8 20 11.8 20 16Z"
            fill="none"
            stroke={gradUrl}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      );
    case "bar-chart":
    case "stats":
    case "records":
    case "chart":
      return (
        <g fill={gradUrl}>
          <rect x="10.5" y="21" width="4.5" height="8.5" rx="2.2" />
          <rect x="17.8" y="15.5" width="4.5" height="14" rx="2.2" />
          <rect x="25" y="11" width="4.5" height="18.5" rx="2.2" />
        </g>
      );
    case "gear":
    case "settings":
      return (
        <g>
          <path
            d="M20 12.2L21.6 10.2L24.2 11.3L24.1 13.8L26.2 15.9L28.7 15.8L29.8 18.4L27.8 20L29.8 21.6L28.7 24.2L26.2 24.1L24.1 26.2L24.2 28.7L21.6 29.8L20 27.8L18.4 29.8L15.8 28.7L15.9 26.2L13.8 24.1L11.3 24.2L10.2 21.6L12.2 20L10.2 18.4L11.3 15.8L13.8 15.9L15.9 13.8L15.8 11.3L18.4 10.2L20 12.2Z"
            fill={gradUrl}
          />
          <circle cx="20" cy="20" r="3.8" fill="rgba(18, 18, 22, 0.30)" />
        </g>
      );
    case "leaf":
    case "physical":
      return (
        <g>
          <path
            d="M28.5 11.5C20.5 11.5 12 15.5 12 24.5C12 26.8 13.5 28.5 15.8 28.5C24.5 28.5 28.5 20 28.5 11.5Z"
            fill={gradUrl}
          />
          <path
            d="M12.5 27.5C16.5 23.5 20.5 19.5 25 16"
            fill="none"
            stroke="rgba(18, 18, 22, 0.28)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      );
    case "lotus":
    case "brain":
    case "mental":
      return (
        <g fill={gradUrl}>
          <path d="M20 11C17 15 16.5 20 20 26.5C23.5 20 23 15 20 11Z" />
          <path
            d="M12 16C12.5 21 15 24.8 19.5 26.8C17.2 21.5 15.5 17.8 12 16Z"
            opacity="0.88"
          />
          <path
            d="M28 16C27.5 21 25 24.8 20.5 26.8C22.8 21.5 24.5 17.8 28 16Z"
            opacity="0.88"
          />
          <rect x="13" y="27.2" width="14" height="2.4" rx="1.2" />
        </g>
      );
    case "hourglass":
    case "recovery":
      return (
        <g
          fill="none"
          stroke={gradUrl}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 11H27M13 29H27" />
          <path
            d="M14.5 11C14.5 16 20 18.2 20 20C20 21.8 14.5 24 14.5 29H25.5C25.5 24 20 21.8 20 20C20 18.2 25.5 16 25.5 11H14.5Z"
            fill={gradUrl}
            fillOpacity="0.32"
          />
        </g>
      );
    case "people":
    case "users":
    case "relationships":
      return (
        <g fill={gradUrl}>
          <circle cx="16.5" cy="15.2" r="3.6" />
          <circle cx="24.2" cy="16.2" r="3" opacity="0.88" />
          <path d="M10.5 27.5C10.5 23.8 13.2 21.2 16.8 21.2C20.4 21.2 23 23.8 23 27.5C23 28.3 22.3 29 21.5 29H12C11.2 29 10.5 28.3 10.5 27.5Z" />
          <path
            d="M22.2 21.8C25.2 21.8 29.5 23.8 29.5 27.2C29.5 28.2 28.8 28.8 27.8 28.8H24.2"
            opacity="0.88"
          />
        </g>
      );
    case "palette":
    case "creativity":
      return (
        <g>
          <path
            d="M20 10.5C14.5 10.5 10 14.8 10 20.2C10 25.5 14.4 29.5 19.6 29.5C21.4 29.5 22.8 28.2 22.8 26.5C22.8 25.7 22.4 25 22 24.4C21.6 23.9 21.8 23 22.6 23H24.5C27.5 23 30 20.5 30 17.5C30 13.5 25.5 10.5 20 10.5Z"
            fill={gradUrl}
          />
          <circle cx="15.2" cy="17.5" r="1.6" fill="rgba(18, 18, 22, 0.35)" />
          <circle cx="18.5" cy="14.5" r="1.6" fill="rgba(18, 18, 22, 0.35)" />
          <circle cx="23" cy="15.2" r="1.6" fill="rgba(18, 18, 22, 0.35)" />
        </g>
      );
    case "briefcase":
    case "work":
      return (
        <g fill={gradUrl}>
          <path
            d="M16 13.5V12C16 10.9 16.9 10 18 10H22C23.1 10 24 10.9 24 12V13.5"
            fill="none"
            stroke={gradUrl}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <rect x="9.5" y="13.5" width="21" height="15.5" rx="4" />
          <rect
            x="18"
            y="19"
            width="4"
            height="3"
            rx="1"
            fill="rgba(18, 18, 22, 0.28)"
          />
        </g>
      );
    case "wallet":
    case "finance":
    case "finances":
      return (
        <g fill={gradUrl}>
          <rect x="9.5" y="12.5" width="21" height="15.5" rx="4" />
          <rect
            x="22"
            y="17.5"
            width="8.5"
            height="5.5"
            rx="2.5"
            fill="rgba(18, 18, 22, 0.24)"
          />
          <circle cx="25" cy="20.2" r="1.3" fill={gradUrl} />
        </g>
      );
    case "book":
    case "book-open":
    case "learning":
      return (
        <g fill={gradUrl}>
          <path d="M11.5 13C11.5 11.3 12.8 10 14.5 10H27C28.1 10 29 10.9 29 12V27C29 28.1 28.1 29 27 29H14.5C12.8 29 11.5 27.7 11.5 26V13Z" />
          <path
            d="M14.5 24.5H26.5V26.8H14.5C13.8 26.8 13.2 26.2 13.2 25.6C13.2 25 13.8 24.5 14.5 24.5Z"
            fill="rgba(18, 18, 22, 0.28)"
          />
        </g>
      );
    case "books":
      return (
        <g fill={gradUrl}>
          <rect x="10" y="12" width="5.2" height="17" rx="1.8" />
          <rect
            x="16.5"
            y="10.5"
            width="5.2"
            height="18.5"
            rx="1.8"
            opacity="0.9"
          />
          <rect
            x="23.5"
            y="12.5"
            width="5.2"
            height="16.5"
            rx="1.8"
            transform="rotate(-8 23.5 12.5)"
          />
        </g>
      );
    case "house":
    case "home":
      return (
        <g fill={gradUrl}>
          <path d="M20 10.5L10 18.8H12.8V28C12.8 28.8 13.5 29.5 14.3 29.5H25.7C26.5 29.5 27.2 28.8 27.2 28V18.8H30L20 10.5Z" />
          <rect
            x="17.5"
            y="21.5"
            width="5"
            height="8"
            rx="1.8"
            fill="rgba(18, 18, 22, 0.28)"
          />
        </g>
      );
    case "compass":
    case "meaning":
      return (
        <g>
          <circle
            cx="20"
            cy="20"
            r="9.5"
            fill="none"
            stroke={gradUrl}
            strokeWidth="2.8"
          />
          <polygon
            points="23.8,16.2 21.4,21.4 16.2,23.8 18.6,18.6"
            fill={gradUrl}
          />
        </g>
      );
    case "laptop":
      return (
        <g fill={gradUrl}>
          <rect x="11.5" y="12" width="17" height="12" rx="2.5" />
          <rect x="8.5" y="25.2" width="23" height="3" rx="1.5" />
        </g>
      );
    case "sprout":
      return (
        <g
          fill={gradUrl}
          stroke={gradUrl}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 29V18" fill="none" />
          <path d="M20 20C14.5 20 12 16.5 12 12.5C16.5 12.5 20 15 20 20Z" />
          <path d="M20 22C25 22 28 19 28 14.5C23.5 14.5 20 17.5 20 22Z" />
        </g>
      );
    case "palm":
      return (
        <g
          fill="none"
          stroke={gradUrl}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 29.5C20 24 21 19 22 15.5" />
          <path d="M22 15.5C18 12.5 13 13.5 11 16.5" />
          <path d="M22 15.5C25.5 12.5 29.5 14 30.5 17" />
          <path d="M22 15.5C19 10.5 14.5 10 12.5 11.5" />
          <path d="M22 15.5C24.5 10.5 28.5 10.5 30 12.5" />
        </g>
      );
    case "camera":
      return (
        <g fill={gradUrl}>
          <path d="M15.5 12L17 10H23L24.5 12H27.5C29.2 12 30.5 13.3 30.5 15V25.5C30.5 27.2 29.2 28.5 27.5 28.5H12.5C10.8 28.5 9.5 27.2 9.5 25.5V15C9.5 13.3 10.8 12 12.5 12H15.5Z" />
          <circle cx="20" cy="20.2" r="4.5" fill="rgba(18, 18, 22, 0.30)" />
          <circle cx="20" cy="20.2" r="2.2" fill={gradUrl} />
        </g>
      );
    case "rocket":
      return (
        <g fill={gradUrl}>
          <path d="M25.8 11.2C21.5 11.5 17.5 14.2 15.2 18.2L12 19.5L14.5 22L18 25.5L20.5 28L21.8 24.8C25.8 22.5 28.5 18.5 28.8 14.2C28.9 12.4 27.6 11.1 25.8 11.2Z" />
          <circle cx="22.5" cy="17.5" r="2.2" fill="rgba(18, 18, 22, 0.30)" />
          <path d="M12 25.5C11 27.2 10.8 28.8 10.8 28.8C10.8 28.8 12.4 28.6 14.1 27.6" />
        </g>
      );
    case "music":
      return (
        <g
          fill={gradUrl}
          stroke={gradUrl}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16.5 25.5V13.5L27.5 11.5V23.5" fill="none" />
          <circle cx="14" cy="25.8" r="3" stroke="none" />
          <circle cx="25" cy="23.8" r="3" stroke="none" />
        </g>
      );
    case "plane":
      return (
        <path
          d="M28.8 11.2C29.5 11.9 29.4 13.2 28.5 14.1L23.8 18.8L26.5 28.2L24.2 29.5L19.8 21.8L15.2 26.2L15.6 29.2L13.8 30.2L12.2 26.8L8.8 25.2L9.8 23.4L12.8 23.8L17.2 19.2L9.5 14.8L10.8 12.5L20.2 15.2L24.9 10.5C25.8 9.6 27.1 9.5 27.8 10.2L28.8 11.2Z"
          fill={gradUrl}
        />
      );
    case "star":
    default:
      return (
        <path
          d="M20 10.2L22.9 16.1L29.4 17L24.7 21.6L25.8 28.1L20 25L14.2 28.1L15.3 21.6L10.6 17L17.1 16.1L20 10.2Z"
          fill={gradUrl}
        />
      );
  }
}
