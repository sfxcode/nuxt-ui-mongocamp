<script setup>
// No UI needed — the global auth middleware intercepts navigation to this path (logoutPath),
// calls logout(), and redirects to logoutRedirectPath before this page ever renders. It still
// needs to exist as a real route, though, or Vue Router logs a "no match found" warning when
// something links to it.
</script>

<template>
  <div />
</template>
