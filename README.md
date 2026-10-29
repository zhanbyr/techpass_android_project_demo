# TechPass — приложение техника и демо-сканер

**Тип:** Android-приложение техника (APK). Сканер проверяющего — отдельная веб-страница; части проекта не объединены.

1. **APK-чекер:** APK техника доступен как артефакт GitHub Actions: [сборки APK](https://github.com/zhanbyr/techpass_android_project_demo/actions/workflows/build-apk.yml). Откройте последний успешный запуск и скачайте `techpass-technician-debug-apk`.
2. **Сканер QR проверяющего:** [открыть сканер](https://zhanbyr.github.io/techpass_android_project_demo/qr/).
3. **Демо-база:** [Excel-файл](demo-database.xlsx). Схема профиля: `id, name, company, work_scope, site, access_until, status, restrictions, photo_url`.

В демо используются только вымышленные профили: Харухи — действителен, Кён — ограничения, Микуру — срок истёк, Ицуки — запрет/отозван. Данные сканера в браузере статические; QR-токен не подписан сервером и не является криптографическим подтверждением. Не используйте демо-результат для реального решения о допуске.