export function asyncHandler(handler) {
  return function handleAsyncRoute(req, res, next) {
    return Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
