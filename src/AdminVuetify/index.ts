import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import './admin.css';
import AdminApp from './AdminApp.vue';

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'gainAdmin',
    themes: {
      gainAdmin: {
        dark: false,
        colors: {
          primary: '#e85f1c',
          secondary: '#262a22',
          background: '#f5f2eb',
          surface: '#fffdf9',
          error: '#b63b2d',
          success: '#2f6b49',
          info: '#496579',
        },
      },
    },
  },
  defaults: {
    VBtn: { rounded: 'lg', elevation: 0 },
    VCard: { rounded: 'xl', elevation: 0 },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VTextarea: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
  },
});

export function mountAdmin(target: Element) {
  document.title = '운영자 관리 | 가인 GA;IN';
  createApp(AdminApp).use(vuetify).mount(target);
}
