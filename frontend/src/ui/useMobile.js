const MOBILE_BREAKPOINT = 768;

export default {
  data() {
    return {
      isMobile: false,
      _mobileMql: null,
    };
  },
  mounted() {
    this._mobileMql = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
    );
    const update = () => {
      this.isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    };
    this._onMobileChange = update;
    this._mobileMql.addEventListener('change', this._onMobileChange);
    update();
  },
  beforeUnmount() {
    if (this._mobileMql && this._onMobileChange) {
      this._mobileMql.removeEventListener('change', this._onMobileChange);
    }
  },
};