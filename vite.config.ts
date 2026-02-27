import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения из текущей директории
  const env = loadEnv(mode, '.', '');
  
  return {
    plugins: [react()],
    define: {
      // Vite автоматически заменяет эту строку на значение ключа при сборке
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Предотвращение ошибок "process is not defined" в некоторых библиотеках
      'process.env': {}
    },
  };
});