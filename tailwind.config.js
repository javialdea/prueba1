/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{ts,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['Merriweather', 'serif'],
            },
            colors: {
                servimedia: {
                    pink: '#E50051',
                    orange: '#F28E1C',
                    gray: '#333333',
                    light: '#F8F9FA',
                    border: '#EEEEEE'
                }
            }
        },
    },
    plugins: [],
}
