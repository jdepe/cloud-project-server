const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const helmet = require('helmet');

require('dotenv').config();

const indexRouter = require('./routes/index');

const app = express();

app.use(helmet());
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // If the page is not found (i.e. no route) output this, else just display the err message
  res.status(err.status || 500);
  if (res.statusCode == 404) {
    res.json({ status: "Error", message: "Page not found!" });
  } else {
    res.json({ status: "Error", message: err.message});
  }
});

module.exports = app;
