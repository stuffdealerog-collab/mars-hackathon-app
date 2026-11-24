// Minimal typings for https://telegram.org/js/telegram-web-app.js (extend as needed).
export {};

declare global {
  interface TelegramWebAppUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  }

  interface TelegramWebApp {
    /** Raw signed query string; send it to the server for validation. */
    initData: string;
    /** Parsed but UNVERIFIED data. Use for display only, never for auth. */
    initDataUnsafe: { user?: TelegramWebAppUser; start_param?: string };
    colorScheme?: "light" | "dark";
    themeParams?: Record<string, string>;
    platform?: string;
    version?: string;
    ready(): void;
    expand(): void;
    close(): void;
    HapticFeedback?: {
      impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
      notificationOccurred(type: "error" | "success" | "warning"): void;
    };
  }

  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}
