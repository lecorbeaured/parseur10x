// Stripe publishable key. This is safe to expose in the browser.
  const STRIPE_PK = 'pk_live_51TFKH15slFMmVhuxVLAxzKVymPgrgxCjk4ztrmwCUYkqjgBHPFr5QfwhnbtrCkTDucLQyRgVTuSxDZbYkDtkjFhk00i3LwJXql';
  
  async function handleCheckout() {
    try {
      const stripe = Stripe(STRIPE_PK);
      const res = await fetch('/.netlify/functions/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'homepage' })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create checkout session');
      }

      const { sessionId } = await res.json();
      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) throw error;
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Something went wrong. Please try again.');
    }
  }

  // Dynamic footer year
  document.getElementById('footerYear').textContent = new Date().getFullYear();

  // Nav scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 10);
  });

  // FAQ accordion
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

  // Scroll reveal
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  // Animated counter for social proof
  function animateCounter(el, target, duration = 2000) {
    const start = 0;
    const startTime = performance.now();
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(start + (target - start) * eased);
      el.textContent = current.toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // Trigger counter when social proof bar is visible
  const spObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const counter = document.getElementById('parsedCounter');
        if (counter && !counter.dataset.animated) {
          animateCounter(counter, 12847);
          counter.dataset.animated = 'true';
        }
        spObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  const spBar = document.querySelector('.social-proof-bar');
  if (spBar) spObserver.observe(spBar);

  // Contact form submit
  async function submitContact() {
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const subject = document.getElementById('contactSubject').value;
    const message = document.getElementById('contactMessage').value.trim();
    const submitButton = document.querySelector('.contact-submit');

    if (!name || !email || !subject || !message) {
      alert('Please fill in all fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter a valid email address.');
      return;
    }

    try {
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';

      const response = await fetch('/.netlify/functions/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message })
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to send message right now.');
      }

      document.querySelector('.contact-submit').style.display = 'none';
      document.querySelectorAll('.contact-field').forEach(f => f.style.display = 'none');
      document.querySelector('.contact-modal-body > p').style.display = 'none';
      document.getElementById('contactSuccess').style.display = 'block';

      setTimeout(() => {
        document.getElementById('contactModal').classList.remove('open');
        document.body.style.overflow = '';
        // Reset form
        setTimeout(() => {
          document.querySelector('.contact-submit').style.display = '';
          document.querySelectorAll('.contact-field').forEach(f => f.style.display = '');
          document.querySelector('.contact-modal-body > p').style.display = '';
          document.getElementById('contactSuccess').style.display = 'none';
          document.getElementById('contactName').value = '';
          document.getElementById('contactEmail').value = '';
          document.getElementById('contactSubject').value = '';
          document.getElementById('contactMessage').value = '';
          submitButton.disabled = false;
          submitButton.textContent = 'Send Message →';
        }, 300);
      }, 2500);
    } catch (err) {
      console.error('Contact error:', err);
      alert(err.message || 'Something went wrong. Please try again.');
      submitButton.disabled = false;
      submitButton.textContent = 'Send Message →';
    }
  }

  // Contact modal close on escape / overlay click
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('contactModal').classList.remove('open');
      document.body.style.overflow = '';
    }
  });
  document.getElementById('contactModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('contactModal')) {
      document.getElementById('contactModal').classList.remove('open');
      document.body.style.overflow = '';
    }
  });
