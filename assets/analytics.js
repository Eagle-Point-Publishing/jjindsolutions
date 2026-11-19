/* J&J Industrial Solutions GA4 interaction tracking.
   Event parameters intentionally exclude names, phone numbers, email
   addresses, chat content, and other visitor-provided information. */
(function () {
  'use strict';

  function track(eventName, parameters) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, Object.assign({
      page_path: window.location.pathname,
    }, parameters || {}));
  }

  function linkLocation(link) {
    if (link.closest('.nav')) return 'navigation';
    if (link.closest('.hero, .page-hero')) return 'hero';
    if (link.closest('.contact')) return 'contact';
    if (link.closest('.callbar')) return 'mobile_callbar';
    if (link.closest('footer')) return 'footer';
    return 'content';
  }

  window.eppTrack = track;

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href') || '';
    var parameters = { link_location: linkLocation(link) };

    if (href.indexOf('tel:') === 0) {
      track('phone_click', parameters);
      return;
    }

    if (href.indexOf('mailto:') === 0) {
      track('email_click', parameters);
      return;
    }

    if (link.classList.contains('btn')) {
      parameters.cta_target = href.split('?')[0].split('#')[0] || 'same_page';
      track('service_cta_click', parameters);
    }
  });
})();
