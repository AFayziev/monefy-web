import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

export const brand: MantineColorsTuple = [
  '#e7fcf0',
  '#d9f2e4',
  '#b8e1ca',
  '#93cfad',
  '#6cbd8f',
  '#60b786',
  '#54b37d',
  '#439d6a',
  '#378c5d',
  '#27794e',
];

/** Page background behind the cards, and the dark scheme's green-tinted surfaces and borders. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--app-background': '#f8faf9' },
  dark: {
    '--app-background': '#141816',
    '--mantine-color-body': '#1c211e',
    '--mantine-color-default': '#1c211e',
    '--mantine-color-default-border': '#2b322e',
  },
});

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: 8,
  colors: { brand },
  defaultRadius: 'md',
});
