'use strict';

(function () {
  // Already authenticated — skip login page entirely
  if (MxAuth.getSession()) {
    window.location.replace('/dashboard/');
    return;
  }

  MxAuth.initSignIn('google-signin-btn', function onSuccess() {
    window.location.replace('/dashboard/');
  }, function onError(msg) {
    var el = document.getElementById('login-err');
    el.textContent = msg;
    el.classList.remove('hidden');
  });
}());
