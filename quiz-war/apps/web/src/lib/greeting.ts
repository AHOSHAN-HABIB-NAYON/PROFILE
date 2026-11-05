/** "Good morning / afternoon / evening / night" for the current time. */
export function greeting(t: (en: string, bn: string) => string) {
  const h = new Date().getHours();
  if (h < 5) return t('Good night', 'শুভ রাত্রি');
  if (h < 12) return t('Good morning', 'শুভ সকাল');
  if (h < 17) return t('Good afternoon', 'শুভ অপরাহ্ন');
  if (h < 20) return t('Good evening', 'শুভ সন্ধ্যা');
  return t('Good night', 'শুভ রাত্রি');
}
