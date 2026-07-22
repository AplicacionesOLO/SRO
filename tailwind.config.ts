/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif'],
          display: ['Inter', 'system-ui', 'sans-serif'],
        },
        colors: {
          sro: {
            navy: {
              950: '#050d1a',
              900: '#0a1628',
              800: '#0f1f38',
              700: '#162744',
              600: '#1e3358',
              500: '#26406c',
            },
            teal: {
              DEFAULT: '#0d9488',
              50: '#f0fdfa',
              100: '#ccfbf1',
              200: '#99f6e4',
              300: '#5eead4',
              400: '#2dd4bf',
              500: '#14b8a6',
              600: '#0d9488',
              700: '#0f766e',
              800: '#115e59',
              900: '#134e4a',
              950: '#042f2e',
            },
            cyan: {
              DEFAULT: '#06b6d4',
              50: '#ecfeff',
              100: '#cffafe',
              200: '#a5f3fc',
              300: '#67e8f9',
              400: '#22d3ee',
              500: '#06b6d4',
              600: '#0891b2',
              700: '#0e7490',
              800: '#155e75',
              900: '#164e63',
            },
          },
        },
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0', transform: 'scale(0.96) translateY(4px)' },
            '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
          },
          shimmer: {
            '0%': { backgroundPosition: '-200% 0' },
            '100%': { backgroundPosition: '200% 0' },
          },
          logisticLine: {
            '0%': { width: '0%', opacity: '0.6' },
            '50%': { width: '100%', opacity: '1' },
            '100%': { width: '100%', opacity: '0.6' },
          },
          logisticLineReset: {
            '0%': { width: '0%', opacity: '0' },
            '5%': { width: '0%', opacity: '0.6' },
            '55%': { width: '100%', opacity: '1' },
            '100%': { width: '100%', opacity: '0' },
          },
          pulseSoft: {
            '0%, 100%': { opacity: '1' },
            '50%': { opacity: '0.5' },
          },
          floatSlow: {
            '0%, 100%': { transform: 'translateY(0px)' },
            '50%': { transform: 'translateY(-6px)' },
          },
          glowPulse: {
            '0%, 100%': { boxShadow: '0 0 12px rgba(13, 148, 136, 0.15)' },
            '50%': { boxShadow: '0 0 24px rgba(13, 148, 136, 0.35)' },
          },
          nodePulse: {
            '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
            '50%': { opacity: '0.8', transform: 'scale(1.3)' },
          },
          lineDash: {
            '0%': { strokeDashoffset: '200' },
            '100%': { strokeDashoffset: '0' },
          },
          slideUp: {
            '0%': { opacity: '0', transform: 'translateY(20px)' },
            '100%': { opacity: '1', transform: 'translateY(0)' },
          },
          slideInRight: {
            '0%': { opacity: '0', transform: 'translateX(30px)' },
            '100%': { opacity: '1', transform: 'translateX(0)' },
          },
          timelineStep: {
            '0%': { opacity: '0', transform: 'translateY(8px)' },
            '100%': { opacity: '1', transform: 'translateY(0)' },
          },
          breathe: {
            '0%, 100%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.02)' },
          },
        },
        animation: {
          fadeIn: 'fadeIn 0.15s ease-out forwards',
          shimmer: 'shimmer 2.5s ease-in-out infinite',
          logisticLine: 'logisticLine 2s ease-in-out forwards',
          logisticLineReset: 'logisticLineReset 3s ease-in-out infinite',
          pulseSoft: 'pulseSoft 2s ease-in-out infinite',
          floatSlow: 'floatSlow 6s ease-in-out infinite',
          glowPulse: 'glowPulse 3s ease-in-out infinite',
          nodePulse: 'nodePulse 4s ease-in-out infinite',
          lineDash: 'lineDash 3s linear infinite',
          slideUp: 'slideUp 0.6s ease-out forwards',
          slideInRight: 'slideInRight 0.6s ease-out forwards',
          timelineStep: 'timelineStep 0.5s ease-out forwards',
          breathe: 'breathe 4s ease-in-out infinite',
        },
      },
    },
    plugins: [],
  }