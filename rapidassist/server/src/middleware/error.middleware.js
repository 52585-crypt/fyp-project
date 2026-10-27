function notFound(req, res) {
  res.status(404).json({ ok: false, message: "Endpoint not found" });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const suppliedStatus = err.statusCode || err.status;
  let status = Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus <= 599
    ? suppliedStatus : 500;
  let message = "Something went wrong. Please try again.";

  if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON request body";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Request is too large. Reduce image sizes and try again.";
  } else if (err.code === 11000) {
    status = 409;
    message = err.keyPattern?.phone ? "Phone already registered" : "A record with these details already exists.";
  } else if (err.name === "CastError" || err.name === "ValidationError" || err.name === "StrictModeError") {
    status = 400;
    message = "Invalid request data. Check the supplied fields and try again.";
  } else if (err.name === "VersionError") {
    status = 409;
    message = "This record has changed. Refresh and try again.";
  } else if (["MongoNetworkError", "MongoNetworkTimeoutError", "MongoServerSelectionError", "MongooseServerSelectionError"].includes(err.name)) {
    status = 503;
    message = "Service temporarily unavailable. Please try again shortly.";
  } else if (status < 500) {
    message = typeof err.message === "string" && err.message ? err.message : "Request could not be processed.";
  } else if (err.expose === true && typeof err.publicMessage === "string") {
    message = err.publicMessage;
  }

  if (status >= 500) console.error("API error:", req.method, req.path, err);
  res.status(status).json({ ok: false, message });
}

module.exports = { errorHandler, notFound };
