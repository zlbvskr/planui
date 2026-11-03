/**
 * Application-owned error messages in natural Ukrainian (C03).
 */
export const ERRORS_UK = {
  VALIDATION_FAILED: 'Помилка перевірки даних.',
  INVALID_ID: 'Некоректний ідентифікатор запису.',
  REQUIRED_TITLE: 'Назва є обов’язковою і не може бути порожньою.',
  INVALID_REVISION: 'Номер ревізії запису має бути додатним цілим числом.',
  STALE_WRITE_CONFLICT:
    'Дані було змінено в іншій вкладці або новішій операції. Оновіть форму та спробуйте ще раз.',
  ENTITY_NOT_FOUND: 'Запитаний запис не знайдено у локальному сховищі.',

  // Temporal & Zone
  INVALID_LOCAL_DATE: 'Некоректна календарна дата (очікується формат РРРР-ММ-ДД з дійсним днем місяця).',
  INVALID_LOCAL_TIME: 'Некоректний локальний час (очікується 24-годинний формат ГГ:ХХ).',
  INVALID_INSTANT: 'Некоректна позначка точного часу (ISO-8601 UTC).',
  INVALID_IANA_ZONE: 'Невідомий або непідтримуваний часовий пояс IANA.',
  INVALID_HALF_OPEN_INTERVAL:
    'Некоректний часовий інтервал: час завершення має бути строго пізніше за час початку.',
  EQUAL_SHIFT_CLOCKS_AMBIGUOUS:
    'Час початку та завершення збігається. Вкажіть явне зміщення дати (наступний день) або різні межі часу.',
  NONEXISTENT_LOCAL_TIME_DST_GAP:
    'Вказаний локальний час пропущено через перехід на літній час у цьому часовому поясі. Оберіть дійсний час або спосіб уточнення.',
  AMBIGUOUS_LOCAL_TIME_DST_REPEAT:
    'Вказаний локальний час повторюється двічі через перехід на зимовий час. Уточніть перше (раніше) або друге (пізніше) входження.',

  // Folders & Hierarchy (C05)
  FOLDER_SELF_PARENT: 'Папка не може бути вкладеною сама в себе.',
  FOLDER_PARENT_NOT_FOUND: 'Батьківську папку не знайдено.',
  FOLDER_CYCLE_DETECTED: 'Переміщення неможливе: виявлено циклічну вкладеність папок.',
  NONEMPTY_FOLDER_DELETE_REQUIRES_MODE:
    'Непорожню папку не можна видалити без явного вибору: перенести вміст або видалити рекурсивно.',

  // Projects, Stages, Tasks (C05, C06, C07)
  STAGE_PROJECT_NOT_FOUND: 'Проєкт для цього етапу не знайдено.',
  TASK_INVALID_OWNERSHIP:
    'Справа може належати або папці (як окрема справа), або одному проєкту (необов’язково з етапом цього ж проєкту).',
  TASK_STAGE_MISMATCH: 'Обраний етап не належить до вказаного проєкту справи.',
  TASK_CONTRADICTORY_PLANNING:
    'Справа не може одночасно мати планування «лише дата» та активні часові резерви.',
  RESERVATION_TASK_NOT_FOUND: 'Справу для часового резерву не знайдено.',

  // Habits (C14)
  HABIT_NOT_FOUND: 'Звичку не знайдено.',
  HABIT_DUPLICATE_BINARY_ENTRY: 'Для цієї звички вже існує запис за вказану локальну дату.',
  HABIT_INVALID_RULE: 'Некоректне правило повторення звички.',
  HABIT_INVALID_NUMERIC_TARGET:
    'Для числової цілі звички вкажіть додатне число та одиницю вимірювання.',
  HABIT_INVALID_NUMERIC_ENTRY:
    'Значення числового прогресу звички має бути невід’ємним скінченним числом.',

  // Work Roster (C13)
  ROSTER_BATCH_HAS_BLOCKING_ERRORS:
    'Пакетне внесення містить некоректні рядки або недійсні дати. Виправте або виключіть помилкові записи перед збереженням.',
  ROSTER_PERIOD_INVALID_RANGE:
    'Некоректний період генерації змін: кінцева дата має бути не раніше за початкову та не перевищувати 366 днів.',
  ROSTER_TEMPLATE_CODE_DUPLICATE:
    'Шаблон зміни з таким коротким кодом уже існує. Оберіть унікальний код.',
  ROSTER_CONFLICT_CONFIRMATION_REQUIRED:
    'Виявлено перетин змін або подій. Підтвердьте свідоме збереження з конфліктом або змініть час.',

  // Personal Space & Inspiration (C15)
  INVALID_SCALE_1_5: 'Значення шкали стану має бути цілим числом від 1 до 5.',
  INVALID_SCALE_1_10: 'Оцінка сфери життя має бути цілим числом від 1 до 10.',
  UNSAFE_INSPIRATION_URL: 'Дозволено лише безпечні посилання з протоколом HTTP або HTTPS.',
  UNSUPPORTED_MEDIA_TYPE:
    'Непідтримуваний формат зображення. Дозволено лише JPEG, PNG або WebP (SVG та довільні вкладення заборонено).',
  ACTIVE_SVG_FORBIDDEN:
    'Активні файли SVG або XML заборонено з міркувань безпеки. Дозволено лише растрові зображення JPEG, PNG або WebP.',
  PROJECT_NOT_FOUND: 'Вказаний проєкт не знайдено.',
  MEDIA_SIGNATURE_MISMATCH:
    'Вміст медіафайлу не відповідає заявленому формату зображення (JPEG, PNG або WebP).',
  MEDIA_DIMENSIONS_EXCEEDED: 'Розміри або обсяг зображення перевищують безпечні ліміти пам’яті.',
  MISSING_REFERENCED_MEDIA: 'Відсутній медіафайл, на який посилається елемент натхнення.',

  // Wishlist & Exact Price (C15)
  WISHLIST_CATEGORY_NOT_FOUND: 'Обрану категорію списку бажань не знайдено.',
  WISHLIST_INVALID_TIMING:
    'Некоректна часова група бажання (дозволено лише «Зараз», «Пізніше» або «Колись»).',
  WISHLIST_INVALID_STATE: 'Некоректний стан виконання бажання.',
  WISHLIST_FULFILLED_TIMESTAMP_MISMATCH:
    'Виконане бажання повинно мати час виконання, а активне — не може мати часу виконання.',
  WISHLIST_PRICE_MISSING_CURRENCY:
    'Для орієнтовної вартості бажання необхідно вказати код валюти (наприклад, UAH, EUR, USD).',
  WISHLIST_PRICE_UNSUPPORTED_CURRENCY: 'Вказаний код валюти не підтримується.',
  WISHLIST_PRICE_INVALID_AMOUNT:
    'Некоректна сума вартості. Введіть невід’ємне число з допустимою кількістю знаків після коми для обраної валюти.',

  // Storage & Multi-tab (C19)
  DB_OPEN_FAILED:
    'Не вдалося відкрити локальну базу даних браузера. Ваші існуючі дані збережено без змін.',
  DB_VERSION_BLOCKED:
    'Оновлення локальної бази даних заблоковано іншою відкритою вкладкою PLANUI. Закрийте інші вкладки.',
  IMPORT_ALREADY_IN_PROGRESS:
    'В іншій вкладці вже триває імпорт або відновлення резервної копії. Зачекайте завершення.',
  STALE_DB_GENERATION_CONFLICT:
    'Дані в базі було повністю замінено або відновлено в іншій вкладці. Оновіть стан перед збереженням змін, щоб не перезаписати відновлені дані.',
  INCOMPATIBLE_NEWER_SCHEMA_WRITE_BLOCKED:
    'Локальну базу даних оновлено новішою версією PLANUI в іншій вкладці. Перезавантажте застосунок перед збереженням змін, щоб старий код не пошкодив дані.',
  UPDATE_BLOCKED_BY_DIRTY_EDITOR:
    'Неможливо перезавантажити застосунок для оновлення, доки відкрито редактор із незбереженими змінами. Спочатку збережіть або закрийте форму.',

  // Backup & Recovery (C20)
  BACKUP_CORRUPTED_ZIP: 'Файл резервної копії пошкоджено або він не є коректним архівом ZIP.',
  BACKUP_UNSAFE_PATH:
    'Архів містить недопустимі шляхи файлів (вихід за межі каталогу, символічні посилання або вкладені архіви).',
  BACKUP_DUPLICATE_ENTRY: 'Архів резервної копії містить дублікати шляхів файлів.',
  BACKUP_BOMB_DETECTED:
    'Архів перевищує безпечні ліміти кількості файлів, розміру або ступеня стиснення.',
  BACKUP_MISSING_REQUIRED_FILES:
    'В архіві резервної копії відсутні обов’язкові файли manifest.json або data.json.',
  BACKUP_UNEXPECTED_FILE:
    'Архів містить неочікуваний файл, який не входить до специфікації резервної копії PLANUI.',
  BACKUP_UNSUPPORTED_VERSION: 'Формат або версія резервної копії не підтримується цією версією PLANUI.',
  BACKUP_CHECKSUM_MISMATCH:
    'Контрольна сума SHA-256 або розмір файлу в архіві не збігається з маніфестом. Архів пошкоджено.',
  BACKUP_ENTITY_COUNT_MISMATCH:
    'Кількість записів у data.json не збігається із заявленою в manifest.json. Архів пошкоджено.',
  BACKUP_VALIDATION_ABORTED:
    'Перевірку архіву резервної копії скасовано користувачем.',
  BACKUP_CONFIRMATION_REQUIRED:
    'Для повної заміни локальних даних необхідне явне підтвердження користувача.',
  RECOVERY_SNAPSHOT_FAILED:
    'Не вдалося створити захисний знімок для відновлення перед заміною даних. Операцію скасовано для збереження ваших поточних записів.',
  RECOVERY_SNAPSHOT_NOT_FOUND:
    'Запитаний локальний знімок відновлення не знайдено.',
  ONLY_RECOVERY_POINT_CONFIRMATION_REQUIRED:
    'Це єдиний доступний локальний знімок відновлення. Для його видалення необхідне окреме явне підтвердження.',
  RESET_CONFIRMATION_REQUIRED:
    'Для повного скидання локальних даних PLANUI необхідне явне підтвердження користувача.',
} as const;

export type ErrorCodeUk = keyof typeof ERRORS_UK;

export class PlanuiError extends Error {
  public readonly code: ErrorCodeUk;
  public readonly details?: string;

  constructor(code: ErrorCodeUk, details?: string) {
    const baseMessage = ERRORS_UK[code];
    super(details ? `${baseMessage} (${details})` : baseMessage);
    this.name = 'PlanuiError';
    this.code = code;
    this.details = details;
  }
}
