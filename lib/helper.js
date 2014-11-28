/*
 * openi_data_api
 * openi-ict.eu
 *
 * Copyright (c) 2013 dmccarthy
 */

'use strict';

var openiLogger  = require('openi-logger');
var openiUtils   = require('openi-cloudlet-utils');
var zmq          = require('m2nodehandler');
var url          = require('url');
var filter       = require('./filter.js');


var init = function(logger_params){
   this.logger = openiLogger(logger_params);
};


var genGetMessage = function(msg, senderToDao, senderToClient, terminal_handler){

   var url_parts   = url.parse(msg.headers.URI, true);
   var query       = url_parts.query;
   var third_party = msg.token.client_id

   var limit  = (undefined !== query.limit)  ? Number(query.limit)   : 30;
   var offset = (undefined !== query.offset) ? Number(query.offset)  :  0;
   var prev   = msg.headers.URI.replace("offset="+offset, "offset="+ (((offset - limit) < 0) ? 0 : (offset - limit)));
   var next   = msg.headers.URI.replace("offset="+offset, "offset="+ (offset + limit));

   var meta = {
      "limit"       : limit,
      "offset"      : offset,
      "total_count" : 0,
      "prev"        : (0 === offset)? null : prev,
      "next"        : next
   };

   //TODO: Dodgy logic?
   if(undefined !== query.property_filter || undefined !== query.with_property){
      filter.filter(msg, meta, senderToClient, third_party);
      return;
   }

   var startKey      = [third_party];
   var endKey        = [third_party + '\uefff'];
   var viewName = 'object_by_cloudlet_id'

   if (undefined !== query.type) {
      if (!openiUtils.isTypeId(query.type)){
         senderToClient.send(msg.uuid, msg.connId, zmq.status.BAD_REQUEST_400, zmq.standard_headers.json, {"error": "invalid type id format"});
         return;
      }
      viewName = 'object_by_type'
      startKey = [third_party, query.type];
      endKey   = [third_party, query.type + '\uefff' ];
   }

   if (undefined !== query.only_show_properties) {
      query.only_show_properties = query.only_show_properties.split(',');
   }

   senderToDao.send({
      'dao_actions'      : [
         {
            'action'      : 'VIEW',
            'start_key'   : startKey ,
            'end_key'     : endKey ,
            'design_doc'  : 'objects_views',
            'view_name'   : viewName,
            'meta'        : meta,
            'filter_show' : query.only_show_properties,
            'resp_type'   : 'object',
            'third_party' : third_party,
            'id_only'     : ('true' === query.id_only),
            'bucket'      : 'objects'
         }
      ],
      'mongrel_sink' : terminal_handler,
      'clients'      : [
         {
            'uuid' : msg.uuid,
            'connId' : msg.connId
         }
      ]
   });
};


var processMongrel2Message = function (msg, senderToDao, senderToClient, terminal_handler) {

   this.logger.logMongrel2Message(msg);

   //Deletes null variables
   for(var key in msg.json) {
      if(msg.json[key] === null) {
         delete msg.json[key];
      }
   }

   switch(msg.headers['METHOD']) {
   case 'GET':
      genGetMessage(msg, senderToDao, senderToClient, terminal_handler);
      break;
   default:
      break;
   }
};


module.exports.init                   = init;
module.exports.processMongrel2Message = processMongrel2Message;
