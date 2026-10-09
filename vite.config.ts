import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// One bundle per heavy vendor family, so chapter chunks stay small and cacheable.
const vendorGroups = [
  { name: 'vendor-three', test: /node_modules[\\/]three[\\/]/, priority: 30 },
  {
    name: 'vendor-r3f',
    test: /node_modules[\\/](@react-three|postprocessing|maath|three-stdlib|zustand|its-fine|suspend-react)[\\/]/,
    priority: 20,
  },
  { name: 'vendor-gsap', test: /node_modules[\\/](gsap|@gsap|lenis)[\\/]/, priority: 20 },
  { name: 'vendor-katex', test: /node_modules[\\/]katex[\\/]/, priority: 20 },
  { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 10 },
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: { groups: vendorGroups },
      },
    },
  },
})
