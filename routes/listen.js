/*
 * Copyright (c) Microsoft. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */
var express = require('express');
var router = express.Router();
var io = require('../helpers/socketHelper.js');
var requestHelper = require('../helpers/requestHelper.js');
var dbHelper = new (require('../helpers/dbHelper'))();
var http = require('http');
var clientStateValueExpected = require('../constants').subscriptionConfiguration.clientState;

/* Default listen route */
router.post('/', function (req, res, next) {
  var status;
  var clientStatesValid;
  var i;
  var resource;
  var subscriptionId;
  // If there's a validationToken parameter in the query string,
  // then this is the request that Office 365 sends to check
  // that this is a valid endpoint.
  // Just send the validationToken back.
  if (req.query && req.query.validationToken) {
    res.send(req.query.validationToken);
    // Send a status of 'Ok'
    status = 200;
  } else {
    clientStatesValid = false;

    // First, validate all the clientState values in array
    for (i = 0; i < req.body.value.length; i++) {
      if (req.body.value[i].clientState !== clientStateValueExpected) {
        // If just one clientState is invalid, we discard the whole batch
        clientStatesValid = false;
        break;
      } else {
        clientStatesValid = true;
      }
    }

    // If all the clientStates are valid, then
    // process the notification
    if (clientStatesValid) {
      for (i = 0; i < req.body.value.length; i++) {
        resource = req.body.value[i].resource;
        subscriptionId = req.body.value[i].subscriptionId;
        processNotification(subscriptionId, resource, res, next);
      }
      // Send a status of 'Accepted'
      status = 202;
    } else {
      // Since the clientState field doesn't have the expected value,
      // this request might NOT come from Microsoft Graph.
      // However, you should still return the same status that you'd
      // return to Microsoft Graph to not alert possible impostors
      // that you have discovered them.
      status = 202;
    }
  }
  res.status(status).end(http.STATUS_CODES[status]);
});

// Get subscription data from the database
// Retrieve the actual mail message data from Office 365.
// Send the message data to the socket.
function processNotification(subscriptionId, resource, res, next) {
  dbHelper.getSubscription(subscriptionId, function (dbError, subscriptionData) {
    if (subscriptionData) {
      requestHelper.getData(
        '/beta/' + resource, subscriptionData.accessToken,
        function (requestError, endpointData) {
          if (endpointData) {
            io.to(subscriptionId).emit('notification_received', endpointData);
          } else if (requestError) {
            res.status(500);
            next(requestError);
          }
        }
      );
    } else if (dbError) {
      res.status(500);
      next(dbError);
    }
  });
}

module.exports = router;
