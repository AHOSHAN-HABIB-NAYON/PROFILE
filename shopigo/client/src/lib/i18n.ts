import { useContext, createContext } from 'react';

const en = {
  home: 'Home', categories: 'Categories', search: 'Search', cart: 'Cart', support: 'Support', wishlist: 'Wishlist',
  searchPlaceholder: 'Search for products, brands and more…', hello: 'Hello', shopNow: 'Shop Now', viewAll: 'View All',
  flashSale: 'Flash Sale', endsIn: 'Ends in', items: 'items', addToCart: 'Add to Cart', orderNow: 'Order Now', outOfStock: 'Out of Stock',
  inStock: 'In Stock', onlyLeft: 'Only {n} left', freeDelivery: 'Free Delivery', cod: 'Cash on Delivery', selectSize: 'Select Size', size: 'Size', color: 'Color',
  quantity: 'Quantity', description: 'Description', specifications: 'Specifications', reviews: 'Reviews', related: 'Related Products', share: 'Share',
  myCart: 'My Cart', clearAll: 'Clear All', emptyCart: 'Your cart is empty', continueShopping: 'Continue Shopping', couponPlaceholder: 'Have a coupon code?',
  apply: 'Apply', remove: 'Remove', subtotal: 'Subtotal', discount: 'Discount', deliveryCharge: 'Delivery Charge', total: 'Total', proceedCheckout: 'Proceed to Checkout',
  checkout: 'Checkout', deliveryInfo: 'Delivery Information', fullName: 'Full Name', phone: 'Phone Number', district: 'District', upazila: 'Upazila / Thana',
  address: 'Full Address', note: 'Note (Optional)', notePlaceholder: 'e.g. Call before delivery', deliveryMethod: 'Delivery Method', orderSummary: 'Order Summary',
  confirmOrder: 'Confirm Order', placingOrder: 'Placing order…', insideDhaka: 'Dhaka', outsideDhaka: 'Outside Dhaka', mostPopular: 'Most Popular',
  selectDistrict: 'Select district', selectUpazila: 'Select upazila / thana', previousCustomer: 'Welcome back! We filled in your previous details.',
  previousCustomerPartial: 'Welcome back! Please confirm your address.', useDetails: 'Use these details',
  orderId: 'Order ID', customerName: 'Customer Name', orderedProducts: 'Ordered Products', shoppingContinue: 'Continue Shopping', whatsappSupport: 'WhatsApp Support',
  clickToMessage: 'Click to message', trackOrder: 'Track Order', contact: 'Contact', callUs: 'Call us', emailUs: 'Email us', visitUs: 'Visit us',
  noProducts: 'No products found', sort: 'Sort', sortNew: 'Newest', sortPopular: 'Popular', sortPriceAsc: 'Price: Low to High', sortPriceDesc: 'Price: High to Low', sortRating: 'Top Rated',
  loadMore: 'Load more', combos: 'Combo Offers', save: 'Save', buyCombo: 'Buy Combo', comboIncludes: 'This combo includes', installApp: 'Install App',
  notFound: 'Page not found', notFoundText: "The page you're looking for doesn't exist or has moved.", goHome: 'Go to Home', tryAgain: 'Try again',
  somethingWrong: 'Something went wrong', offline: "You're offline", writeReview: 'Write a review', yourName: 'Your name', submit: 'Submit', noReviews: 'No reviews yet',
  reviewThanks: 'Thanks! Your review will appear after approval.', deliveryTime: 'Delivery time', genuine: '100% Genuine', easyReturn: 'Easy Return', popularBrands: 'Popular Brands',
  couponApplied: 'Coupon applied', copied: 'Copied!', copy: 'Copy', off: 'OFF', minOrder: 'Min. order', recentlyViewed: 'Recently viewed', addedToCart: 'Added to cart',
  viewCart: 'View cart', allProducts: 'All Products', trackTitle: 'Track your order', trackHelp: 'Enter your Order ID and phone number', track: 'Track',
};

type Dict = typeof en;
const bn: Dict = {
  home: 'হোম', categories: 'ক্যাটাগরি', search: 'সার্চ', cart: 'কার্ট', support: 'সাপোর্ট', wishlist: 'উইশলিস্ট',
  searchPlaceholder: 'পণ্য, ব্র্যান্ড খুঁজুন…', hello: 'হ্যালো', shopNow: 'এখনই কিনুন', viewAll: 'সব দেখুন',
  flashSale: 'ফ্ল্যাশ সেল', endsIn: 'শেষ হবে', items: 'টি পণ্য', addToCart: 'কার্টে যোগ করুন', orderNow: 'অর্ডার করুন', outOfStock: 'স্টক শেষ',
  inStock: 'স্টকে আছে', onlyLeft: 'মাত্র {n}টি বাকি', freeDelivery: 'ফ্রি ডেলিভারি', cod: 'ক্যাশ অন ডেলিভারি', selectSize: 'সাইজ নির্বাচন করুন', size: 'সাইজ', color: 'কালার',
  quantity: 'পরিমাণ', description: 'বিবরণ', specifications: 'স্পেসিফিকেশন', reviews: 'রিভিউ', related: 'সম্পর্কিত পণ্য', share: 'শেয়ার',
  myCart: 'আমার কার্ট', clearAll: 'সব মুছুন', emptyCart: 'আপনার কার্ট খালি', continueShopping: 'কেনাকাটা চালিয়ে যান', couponPlaceholder: 'কুপন কোড আছে?',
  apply: 'প্রয়োগ', remove: 'মুছুন', subtotal: 'সাবটোটাল', discount: 'ছাড়', deliveryCharge: 'ডেলিভারি চার্জ', total: 'সর্বমোট', proceedCheckout: 'চেকআউট করুন',
  checkout: 'চেকআউট', deliveryInfo: 'ডেলিভারি তথ্য', fullName: 'আপনার নাম', phone: 'মোবাইল নম্বর', district: 'জেলা', upazila: 'উপজেলা / থানা',
  address: 'সম্পূর্ণ ঠিকানা', note: 'নোট (ঐচ্ছিক)', notePlaceholder: 'যেমন: ডেলিভারির আগে কল করবেন', deliveryMethod: 'ডেলিভারি পদ্ধতি', orderSummary: 'অর্ডার সারাংশ',
  confirmOrder: 'অর্ডার নিশ্চিত করুন', placingOrder: 'অর্ডার হচ্ছে…', insideDhaka: 'ঢাকা', outsideDhaka: 'ঢাকার বাইরে', mostPopular: 'সবচেয়ে জনপ্রিয়',
  selectDistrict: 'জেলা নির্বাচন করুন', selectUpazila: 'উপজেলা / থানা নির্বাচন করুন', previousCustomer: 'আবার স্বাগতম! আপনার আগের তথ্য বসানো হয়েছে।',
  previousCustomerPartial: 'আবার স্বাগতম! অনুগ্রহ করে ঠিকানা নিশ্চিত করুন।', useDetails: 'এই তথ্য ব্যবহার করুন',
  orderId: 'অর্ডার আইডি', customerName: 'গ্রাহকের নাম', orderedProducts: 'অর্ডারকৃত পণ্য', shoppingContinue: 'শপিং চালিয়ে যান', whatsappSupport: 'WhatsApp সাপোর্ট',
  clickToMessage: 'মেসেজ করতে ক্লিক করুন', trackOrder: 'অর্ডার ট্র্যাক', contact: 'যোগাযোগ', callUs: 'কল করুন', emailUs: 'ইমেইল', visitUs: 'ঠিকানা',
  noProducts: 'কোনো পণ্য পাওয়া যায়নি', sort: 'সাজান', sortNew: 'নতুন', sortPopular: 'জনপ্রিয়', sortPriceAsc: 'দাম: কম থেকে বেশি', sortPriceDesc: 'দাম: বেশি থেকে কম', sortRating: 'সেরা রেটিং',
  loadMore: 'আরও দেখুন', combos: 'কম্বো অফার', save: 'সাশ্রয়', buyCombo: 'কম্বো কিনুন', comboIncludes: 'এই কম্বোতে আছে', installApp: 'অ্যাপ ইনস্টল',
  notFound: 'পেজ পাওয়া যায়নি', notFoundText: 'আপনি যে পেজটি খুঁজছেন সেটি নেই বা সরানো হয়েছে।', goHome: 'হোমে যান', tryAgain: 'আবার চেষ্টা করুন',
  somethingWrong: 'কিছু একটা সমস্যা হয়েছে', offline: 'আপনি অফলাইনে আছেন', writeReview: 'রিভিউ লিখুন', yourName: 'আপনার নাম', submit: 'জমা দিন', noReviews: 'এখনো কোনো রিভিউ নেই',
  reviewThanks: 'ধন্যবাদ! অনুমোদনের পর রিভিউটি দেখা যাবে।', deliveryTime: 'ডেলিভারি সময়', genuine: '১০০% অরিজিনাল', easyReturn: 'সহজ রিটার্ন', popularBrands: 'জনপ্রিয় ব্র্যান্ড',
  couponApplied: 'কুপন প্রয়োগ হয়েছে', copied: 'কপি হয়েছে!', copy: 'কপি', off: 'ছাড়', minOrder: 'সর্বনিম্ন অর্ডার', recentlyViewed: 'সম্প্রতি দেখা', addedToCart: 'কার্টে যোগ হয়েছে',
  viewCart: 'কার্ট দেখুন', allProducts: 'সব পণ্য', trackTitle: 'অর্ডার ট্র্যাক করুন', trackHelp: 'অর্ডার আইডি ও মোবাইল নম্বর দিন', track: 'ট্র্যাক',
};

export type TKey = keyof Dict;
export const LangContext = createContext<'bn' | 'en'>('en');

export function useT() {
  const lang = useContext(LangContext);
  const dict = lang === 'bn' ? bn : en;
  return (key: TKey, vars?: Record<string, string | number>) => {
    let s = dict[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}
