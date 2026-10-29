import { createTheme, type MantineColorsTuple } from '@mantine/core';

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

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: 8,
  colors: { brand },
  defaultRadius: 'md',
});
