// Tailwind runs through Next's own CSS pipeline, so the build cache tracks globals.css changes.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
