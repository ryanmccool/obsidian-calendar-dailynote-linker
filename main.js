"use strict";var _=Object.defineProperty;var ye=Object.getOwnPropertyDescriptor;var De=Object.getOwnPropertyNames;var be=Object.prototype.hasOwnProperty;var Pe=(e,t)=>{for(var n in t)_(e,n,{get:t[n],enumerable:!0})},Ne=(e,t,n,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of De(t))!be.call(e,r)&&r!==n&&_(e,r,{get:()=>t[r],enumerable:!(a=ye(t,r))||a.enumerable});return e};var Ce=e=>Ne(_({},"__esModule",{value:!0}),e);var et={};Pe(et,{default:()=>$});module.exports=Ce(et);var f=require("obsidian");var v=require("obsidian");function p(e){return typeof e=="string"?e:""}function x(e){return!!window.app.plugins.getPlugin("periodic-notes")?.settings?.[e]?.enabled}function M(){try{let{internalPlugins:e,plugins:t}=window.app;if(x("daily")){let{format:o,folder:i,template:s}=t.getPlugin("periodic-notes")?.settings?.daily||{};return{format:o||"YYYY-MM-DD",folder:p(i).trim(),template:p(s).trim()}}let{folder:n,format:a,template:r}=e.getPluginById("daily-notes")?.instance?.options||{};return{format:a||"YYYY-MM-DD",folder:p(n).trim(),template:p(r).trim()}}catch(e){console.info("No custom daily note settings found!",e)}}function ke(){try{let e=window.app.plugins,t=e.getPlugin("calendar")?.options,n=e.getPlugin("periodic-notes")?.settings?.weekly;if(x("weekly")&&n)return{format:n.format||"gggg-[W]ww",folder:p(n.folder).trim(),template:p(n.template).trim()};let a=t||{};return{format:a.weeklyNoteFormat||"gggg-[W]ww",folder:p(a.weeklyNoteFolder).trim(),template:p(a.weeklyNoteTemplate).trim()}}catch(e){console.info("No custom weekly note settings found!",e)}}function ve(){let e=window.app.plugins;try{let t=x("monthly")&&e.getPlugin("periodic-notes")?.settings?.monthly||{};return{format:t.format||"YYYY-MM",folder:p(t.folder).trim(),template:p(t.template).trim()}}catch(t){console.info("No custom monthly note settings found!",t)}}function xe(){let e=window.app.plugins;try{let t=x("quarterly")&&e.getPlugin("periodic-notes")?.settings?.quarterly||{};return{format:t.format||"YYYY-[Q]Q",folder:p(t.folder).trim(),template:p(t.template).trim()}}catch(t){console.info("No custom quarterly note settings found!",t)}}function Fe(){let e=window.app.plugins;try{let t=x("yearly")&&e.getPlugin("periodic-notes")?.settings?.yearly||{};return{format:t.format||"YYYY",folder:p(t.folder).trim(),template:p(t.template).trim()}}catch(t){console.info("No custom yearly note settings found!",t)}}function Z(e){return e.replace(/\[[^\]]*\]/g,"")}function Ee(e,t){if(t==="week"){let n=Z(e);return/w{1,2}/i.test(n)&&(/M{1,4}/.test(n)||/D{1,4}/.test(n))}return!1}function R(e,t){return Ae(e.basename,t)}function Ae(e,t){let n={day:M,week:ke,month:ve,quarter:xe,year:Fe}[t]().format.split("/").pop(),a=window.moment(e,n,!0);if(!a.isValid())return null;if(Ee(n,t)&&t==="week"){let r=Z(n);if(/w{1,2}/i.test(r))return window.moment(e,n.replace(/M{1,4}/g,"").replace(/D{1,4}/g,""),!1)}return a}var G=require("node:child_process"),X=require("node:util");var d=class extends Error{constructor(t){super(t),this.name="CalendarPayloadValidationError"}};function T(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function F(e,t){if(typeof e!="string")throw new d(`${t} must be a string`);return e}function b(e,t){if(e!==null&&typeof e!="string")throw new d(`${t} must be a string or null`);return e}function Y(e,t){let n=F(e,t);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(n)||Number.isNaN(Date.parse(n)))throw new d(`${t} must be a valid ISO date`);return n}function O(e){let t=F(e,"targetDate");if(!/^\d{4}-\d{2}-\d{2}$/.test(t))throw new d("targetDate must be YYYY-MM-DD");let[n,a,r]=t.split("-").map(Number),o=new Date(Date.UTC(n,a-1,r));if(o.getUTCFullYear()!==n||o.getUTCMonth()!==a-1||o.getUTCDate()!==r)throw new d("targetDate must be a valid calendar date");return t}function Me(e){return/^(?:Calendar attendee|Some Calendar attendee).*unavailable on this macOS\/source\.$/.test(e)}function Te(e,t){if(!T(e))throw new d(`events attendee ${t} must be an object`);return{displayName:b(e.displayName,`attendee ${t} displayName`),email:b(e.email,`attendee ${t} email`),status:b(e.status,`attendee ${t} status`)}}function Ye(e,t){if(!T(e))throw new d(`event ${t} must be an object`);let n=e.attendees;if(!Array.isArray(n))throw new d(`event ${t} attendees must be an array`);let a=Y(e.start,`event ${t} start`),r=Y(e.end,`event ${t} end`);if(Date.parse(r)<Date.parse(a))throw new d(`event ${t} end cannot precede start`);if(typeof e.allDay!="boolean")throw new d(`event ${t} allDay must be a boolean`);return{id:b(e.id,`event ${t} id`),calendar:b(e.calendar,`event ${t} calendar`),title:F(e.title,`event ${t} title`),start:a,end:r,allDay:e.allDay,url:b(e.url,`event ${t} url`),location:b(e.location,`event ${t} location`),notes:e.notes===null?null:(()=>{throw new d(`event ${t} notes must be null`)})(),attendees:n.map((o,i)=>Te(o,i))}}function K(e){let t;try{t=JSON.parse(e)}catch{throw new d("Calendar bridge output was not valid JSON")}return Se(t)}function Se(e){if(!T(e))throw new d("Calendar bridge output must be a JSON object");if(e.schemaVersion!==1)throw new d("Calendar bridge output has an unsupported schema version");if(!T(e.range))throw new d("Calendar bridge output range must be an object");let t=Y(e.range.start,"range start"),n=Y(e.range.end,"range end");if(Date.parse(n)<=Date.parse(t))throw new d("range end must be after range start");let a=F(e.range.timeZone,"range timeZone").trim();if(!a)throw new d("range timeZone cannot be empty");if(!Array.isArray(e.events))throw new d("Calendar bridge output events must be an array");if(!Array.isArray(e.warnings)||e.warnings.some(o=>typeof o!="string"))throw new d("Calendar bridge output warnings must be an array of strings");let r=e.warnings;return{schemaVersion:1,source:F(e.source,"source"),targetDate:O(e.targetDate),range:{start:t,end:n,timeZone:a},events:e.events.map((o,i)=>Ye(o,i)),warnings:r.map(o=>{if(!Me(o))throw new d("Calendar bridge warnings may only describe unavailable attendee properties");return o})}}var J=`/*
 * Fixed JXA bridge for Calendar.app.
 * JXA invokes run(argv); its return value is the only stdout produced by this script.
 */

function readEventProperty(object, propertyName) {
  if (!object) throw new Error("Calendar property " + propertyName + " had no object.");
  try {
    var value = object[propertyName];
    return typeof value === "function" ? value.call(object) : value;
  } catch (error) {
    throw new Error("Calendar property " + propertyName + " could not be read.");
  }
}

function readOptionalAttendeeProperty(object, propertyName) {
  try {
    if (!object) return { available: false, value: null };
    var value = object[propertyName];
    value = typeof value === "function" ? value.call(object) : value;
    return { available: value !== undefined, value: value === undefined ? null : value };
  } catch (error) {
    return { available: false, value: null };
  }
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  var text = String(value);
  return text.length ? text : null;
}

function dateOrNull(value) {
  if (!value) return null;
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function warningOnce(warnings, message) {
  if (warnings.indexOf(message) === -1) warnings.push(message);
}

function attendeeValue(attendee, propertyName, warningLabel, warnings) {
  var result = readOptionalAttendeeProperty(attendee, propertyName);
  if (!result.available) {
    warningOnce(warnings, "Calendar attendee " + warningLabel + " data is unavailable on this macOS/source.");
    return null;
  }
  return stringOrNull(result.value);
}

function readAttendees(event, warnings) {
  var rawAttendees;
  try {
    var attendeeResult = readOptionalAttendeeProperty(event, "attendees");
    if (!attendeeResult.available) rawAttendees = undefined;
    else rawAttendees = attendeeResult.value;
  } catch (error) {
    rawAttendees = undefined;
  }
  if (rawAttendees === undefined) {
    warningOnce(warnings, "Calendar attendee data is unavailable on this macOS/source.");
    return [];
  }
  if (rawAttendees === null) return [];
  if (!Array.isArray(rawAttendees)) {
    warningOnce(warnings, "Calendar attendee data is unavailable on this macOS/source.");
    return [];
  }

  var attendees = [];
  try {
    for (var index = 0; index < rawAttendees.length; index += 1) {
      var attendee = rawAttendees[index];
      attendees.push({
        displayName: attendeeValue(attendee, "displayName", "display name", warnings),
        email: attendeeValue(attendee, "email", "email", warnings),
        status: attendeeValue(attendee, "participationStatus", "participation status", warnings)
      });
    }
  } catch (error) {
    warningOnce(warnings, "Some Calendar attendee data is unavailable on this macOS/source.");
  }
  return attendees;
}

function main() {
  var Calendar = Application("Calendar");
  var warnings = [];
  var targetDate = arguments.length === 1 ? String(arguments[0]) : "";
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(targetDate)) throw new Error("Calendar target date must be YYYY-MM-DD.");
  var dateParts = targetDate.split("-").map(Number);
  var year = dateParts[0];
  var month = dateParts[1];
  var day = dateParts[2];
  var rangeStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (rangeStart.getFullYear() !== year || rangeStart.getMonth() !== month - 1 || rangeStart.getDate() !== day) {
    throw new Error("Calendar target date must be a valid local date.");
  }
  var rangeEnd = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  var timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  var events = [];

  var calendars = Calendar.calendars();
  if (!Array.isArray(calendars)) throw new Error("Calendar calendars could not be enumerated.");
  for (var calendarIndex = 0; calendarIndex < calendars.length; calendarIndex += 1) {
    var calendar = calendars[calendarIndex];
    var calendarName = stringOrNull(readEventProperty(calendar, "name"));
    var calendarEvents;
    try {
      calendarEvents = calendar.events.whose({
        startDate: { _lessThan: rangeEnd },
        endDate: { _greaterThan: rangeStart }
      })();
    } catch (error) {
      throw new Error("Calendar events could not be enumerated.");
    }
    if (!Array.isArray(calendarEvents)) throw new Error("Calendar events could not be enumerated.");

    for (var eventIndex = 0; eventIndex < calendarEvents.length; eventIndex += 1) {
      var event = calendarEvents[eventIndex];
      var start = dateOrNull(readEventProperty(event, "startDate"));
      var end = dateOrNull(readEventProperty(event, "endDate"));
      if (!start || !end) {
        throw new Error("A Calendar event did not provide valid dates.");
      }
      if (start >= rangeEnd || end <= rangeStart) continue;

      var allDay = readEventProperty(event, "alldayEvent");
      if (typeof allDay !== "boolean") throw new Error("Calendar event all-day value was not boolean.");
      events.push({
        id: stringOrNull(readEventProperty(event, "uid")),
        calendar: calendarName,
        title: stringOrNull(readEventProperty(event, "summary")) || "(Untitled event)",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: Boolean(allDay),
        url: stringOrNull(readEventProperty(event, "url")),
        location: stringOrNull(readEventProperty(event, "location")),
        notes: null,
        attendees: readAttendees(event, warnings)
      });
    }
  }

  return JSON.stringify({
    schemaVersion: 1,
    source: "Calendar.app",
    targetDate: targetDate,
    range: {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
      timeZone: timeZone
    },
    events: events,
    warnings: warnings
  });
}

function run(argv) {
  if (!argv || argv.length !== 1) throw new Error("Calendar target date argument is required.");
  return main.apply(null, argv);
}
`;var Ie=(0,X.promisify)(G.execFile),$e=async(e,t,n)=>await Ie(e,t,n),w=class extends Error{constructor(t){super(t),this.name="CalendarBridgeError"}};async function ee(e,t=$e){try{O(e)}catch(r){throw new w(r instanceof Error?r.message:"Calendar target date must be YYYY-MM-DD.")}let n;try{n=await t("/usr/bin/osascript",["-l","JavaScript","-e",J,e],{encoding:"utf8",timeout:3e4,maxBuffer:2*1024*1024,shell:!1,windowsHide:!0})}catch(r){let o=r instanceof Error?r.message:String(r);throw new w("Calendar access failed. Allow Obsidian to control Calendar in System Settings > Privacy & Security > Automation, then try again. "+o)}let a=n.stdout.trim();if(!a){let r=n.stderr.trim();throw new w(`Calendar bridge returned no data. Check Calendar and Automation permissions${r?`: ${r}`:"."}`)}try{let r=K(a);if(r.targetDate!==e)throw new Error(`Calendar bridge returned ${r.targetDate} instead of ${e}.`);return r}catch(r){let o=r instanceof Error?r.message:String(r);throw new w(`Calendar bridge returned malformed data: ${o}`)}}function H(e,t,n){if(!t)return;let a=e.get(t)??[];a.some(r=>r.path===n.path)||(a.push(n),a.sort((r,o)=>r.path.localeCompare(o.path))),e.set(t,a)}function S(e){return e.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase()}function te(e){return e.normalize("NFKC").trim().replace(/\s+/gu,"").toLowerCase()}function U(e,t){let n=e?.[t];return typeof n=="string"?[n]:Array.isArray(n)?n.filter(a=>typeof a=="string"):[]}function Ve(e){let t=e.path.replaceAll("\\","/"),n=e.basename||t.split("/").at(-1)?.replace(/\.md$/i,"")||"";return{path:t,basename:n,file:e.file}}function Le(e,t){let n=e.replaceAll("\\","/");return t.some(a=>{let r=a.replaceAll("\\","/").replace(/\/+$/u,"");return n===r||n.startsWith(`${r}/`)})}function ne(e,t){let n=new Map,a=new Map;for(let r of e){let o=r.path.replaceAll("\\","/");if(!o.toLowerCase().endsWith(".md")||Le(o,t))continue;let i=Ve(r);H(a,S(i.basename),i);for(let s of U(r.frontmatter,"aliases"))H(a,S(s),i);for(let s of[...U(r.frontmatter,"email"),...U(r.frontmatter,"emails")])H(n,te(s),i)}return{byEmail:n,byName:a}}function _e(e,t){let n=t.email?te(t.email):"";if(n){let o=e.byEmail.get(n);if(o?.length===1)return o[0];if(o&&o.length>1)return null}let a=t.displayName?S(t.displayName):"";if(!a)return null;let r=e.byName.get(a);return r?.length===1?r[0]:null}function Re(e,t){let n=[];for(let a of t){let r=_e(e,a);r&&!n.some(o=>o.path===r.path)&&n.push(r)}return n}function re(e,t,n){let a=Re(e,t);if(a.length>0)return a;let r=e.byName.get(S(n));return r?.length===1?[r[0]]:[]}function ae(e,t){let n=new Map,a=r=>r.map(o=>{let i=n.get(o.path);return i===void 0&&(i=t(o),n.set(o.path,i)),{...o,markdownLink:i}});return{byEmail:new Map([...e.byEmail].map(([r,o])=>[r,a(o)])),byName:new Map([...e.byName].map(([r,o])=>[r,a(o)]))}}var N="<!-- calendar-daily-note-linker:start -->",C="<!-- calendar-daily-note-linker:end -->",k=class extends Error{constructor(t){super(t),this.name="CalendarBlockError"}};function ie(e){return[N,...e.map(le),C].join(`
`)}function se(e,t){Oe(t);let n=[],a=[],r=e.split(`
`);if(r.forEach((s,l)=>{let g=s.endsWith("\r")?s.slice(0,-1):s,m=g===N,h=g===C;if(m&&n.push(l),h&&a.push(l),(g.includes(N)||g.includes(C))&&!m&&!h)throw new k("The Calendar section marker must be on an exact standalone line.")}),n.length===0&&a.length===0)return He(e,t);if(n.length!==1||a.length!==1||n[0]>=a[0])throw new k("The Calendar section markers are duplicated, incomplete, or out of order.");let o=oe(r,n[0]),i=oe(r,a[0]+1);return`${e.slice(0,o)}${t}${e.slice(i)}`}function Oe(e){let t=e.split(`
`).map(n=>n.endsWith("\r")?n.slice(0,-1):n);if(t[0]!==N||t[t.length-1]!==C)throw new k("Generated Calendar content has invalid section markers.");if(t.slice(1,-1).some(n=>n.includes(N)||n.includes(C)))throw new k("Generated Calendar content contains a section marker literal.")}function le(e){return e.replace(/\r\n?|\n|\u2028|\u2029/gu," ").replace(/[\u0000-\u001f\u007f-\u009f]/gu,"").replaceAll(N,"[calendar section start]").replaceAll(C,"[calendar section end]")}function z(e){return le(e).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replace(/[\\`*_{}\[\]()#+\-.!|>~]/gu,"\\$&")}function He(e,t){let n=e.length>0&&!e.endsWith(`
`)?`
`:"";return`${e}${n}${t}
`}function oe(e,t){let n=0;for(let a=0;a<t&&a<e.length;a+=1)n+=e[a].length+1;return n}function Ue(e){return e.replaceAll("\\","\\\\").replace(/[\s<>]/gu,t=>encodeURIComponent(t)).replaceAll("(","\\(").replaceAll(")","\\)").replaceAll('"',"%22")}function ze(e){if(!e?.trim()||/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(e)||e.includes("<!-- calendar-daily-note-linker:start -->")||e.includes("<!-- calendar-daily-note-linker:end -->"))return null;try{let t=new URL(e.trim());return t.protocol==="http:"||t.protocol==="https:"?t.href:null}catch{return null}}function We(e,t){if(e.allDay!==t.allDay)return e.allDay?-1:1;let n=Date.parse(e.start)-Date.parse(t.start);if(n!==0)return n;let a=Date.parse(e.end)-Date.parse(t.end);return a!==0?a:e.title.localeCompare(t.title)}function de(e,t){let n={timeZone:t,hour:"numeric",minute:"2-digit",hour12:!0};try{return new Intl.DateTimeFormat("en-US",n).format(new Date(e))}catch{return new Intl.DateTimeFormat("en-US",{...n,timeZone:void 0}).format(new Date(e))}}function qe(e,t,n){let a=ze(e.url),r=a?`[${z(e.title)}](${Ue(a)})`:z(e.title),i=re(n,e.attendees,e.title).map(l=>l.markdownLink).filter(l=>!!l),s=e.allDay?"All day":`${de(e.start,t.range.timeZone)}\u2013${de(e.end,t.range.timeZone)}`;return{line:`- ${r}${i.length?` \u2014 ${i.join(", ")}`:""} \u2014 ${s}`,linkCount:i.length}}function ce(e,t,n){let a=[t],r=[...e.events].sort(We),o=0;if(!r.length)a.push(`No Calendar events found for ${e.targetDate}.`);else for(let i of r){let s=qe(i,e,n);a.push(s.line),o+=s.linkCount}return{block:ie(a),eventCount:r.length,linkCount:o}}var E={excludedVaultFolders:[],sectionHeading:"## Calendar"},W=class extends Error{constructor(){super("Vault folder exclusions are malformed. Correct them in settings before importing Calendar events."),this.name="ExcludedVaultFolderError"}};function Be(e){let t=e.replaceAll("\\","/"),n=t.split("/");if(!(!t||t.startsWith("/")||/^[A-Za-z]:/.test(t)||n.some(a=>a.length===0||a==="."||a===".."||a.includes("\0"))))return t}function I(e){let t=Array.isArray(e),n=typeof e=="string"?e.split(/\r\n?|\n|\u2028|\u2029/gu):t&&e.every(r=>typeof r=="string")?e:void 0;if(!n)return;let a=[];for(let r of n){if(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(r))return;if(!r.trim())continue;let o=Be(r);if(!o)return;a.includes(o)||a.push(o)}return a}function ue(e){if(e===void 0)return E.excludedVaultFolders;let t=I(e);if(!t)throw new W;return t}function ge(e){if(e===void 0)return{folders:[],malformed:!1};let t=I(e);return t?{folders:t,malformed:!1}:{folders:[],malformed:!0,rawInput:typeof e=="string"?e:Array.isArray(e)?e.map(String).join(`
`):String(e)}}function q(e){if(typeof e!="string")return;let t=e.trim().replace(/[\r\n]+/g," ").replace(/\s+/g," ");if(!(!/^#{1,6}\s+\S/.test(t)||t.includes("<!--")||t.includes("-->")||t.includes("\0")))return t}function B(e){return q(e)??E.sectionHeading}var A=class extends Error{constructor(t){super(t==="periodic"?"Periodic Notes daily functionality is enabled. Disable it and enable the core Daily Notes plugin.":"The core Daily Notes plugin is unavailable. Enable it and try again."),this.name="DailyNotesModeError"}};function y(e){return typeof e=="object"&&e!==null}function je(e){try{if(!y(e))return"disabled";let t=y(e.internalPlugins)?e.internalPlugins:void 0,a=(t&&y(t.plugins)?t.plugins:void 0)?.["daily-notes"],r=y(a)&&a.enabled===!0,o=y(e.plugins)?e.plugins:void 0,s=(o&&typeof o.getPlugin=="function"?o.getPlugin.bind(o):void 0)?.("periodic-notes"),l=y(s)&&y(s.settings)?s.settings:void 0;return(l&&y(l.daily)?l.daily:void 0)?.enabled===!0?"periodic":r?"core":"disabled"}catch{return"disabled"}}function P(e){let t=je(e);if(t!=="core")throw new A(t)}var c=class extends Error{constructor(t){super(t),this.name="ActiveDailyNoteError"}};function Qe(e){return(e??"").replaceAll("\\","/").replace(/\/+$/u,"")}function Ze(e){let t=[],n=0;for(;n<e.length;){if(e[n]==="\\"){n+=2;continue}if(e[n]==="["){let a=e.indexOf("]",n+1);n=a===-1?e.length:a+1;continue}if(/[YMD]/u.test(e[n])){let a=n,r=e[n];for(;n<e.length&&e[n]===r&&n-a<5;)n+=1;t.push({token:e.slice(a,n),start:a,end:n});continue}n+=1}return t}function Ke(e){if(typeof e!="string"||!e)return!1;let t=Ze(e),n=t.filter(({token:s})=>s.startsWith("D")),a=n.some(({token:s})=>s.length>=3),r=n.some(({token:s})=>s.length<=2),o=t.some(({token:s})=>s.startsWith("M"));return!t.some(({token:s})=>s.startsWith("Y"))||!(a||o&&r)?!1:t.some(({token:s})=>s==="YYYY")}function Je(e,t){let n=e.replaceAll("\\","/"),a=t?`${t}/`:"";if(t&&!n.startsWith(a))throw new c("The active note is outside the configured core Daily Notes folder.");let r=n.slice(a.length);if(!r.endsWith(".md"))throw new c("The active note must be a Markdown Daily Note.");return r.slice(0,-3)}function j(e,t,n,a,r){if(e.extension.toLowerCase()!=="md")throw new c("Open an existing core Daily Note before running this command.");if(!Ke(t.format))throw new c("The core Daily Notes filename format cannot identify one calendar date.");let o=Qe(t.folder),i=t.format,s=Je(e.path,o),l=n(s,i,!0);if(!l?.isValid()||l.format(i)!==s){if(!r)throw new c("The active note path is not the canonical core Daily Note for one date.");let h=n(s,i,!1);if(!h?.isValid())throw new c("The active note path is not the canonical core Daily Note for one date.");let D=pe(s,i,h.format("YYYY-MM-DD"),r);if(D.length!==1)throw new c("The active note path can represent more than one calendar date.");l=D[0]}let g=`${o?`${o}/`:""}${l.format(i)}.md`;if(e.path.replaceAll("\\","/")!==g)throw new c("The active note path is not the canonical core Daily Note path.");if(!r||Xe(s,i,l,r))throw new c("The active note path can represent more than one calendar date.");if(a&&!i.includes("/")){let h=a(e,"day");if(h?.isValid()&&h.format("YYYY-MM-DD")!==l.format("YYYY-MM-DD"))throw new c("The active note date could not be confirmed by core Daily Notes.")}let m=l.format("YYYY-MM-DD");if(!/^\d{4}-\d{2}-\d{2}$/u.test(m))throw new c("The active note did not resolve to one calendar date.");return m}function Ge(e,t){let n=new Date(Date.UTC(e,0,1+t));return`${String(n.getUTCFullYear()).padStart(4,"0")}-${String(n.getUTCMonth()+1).padStart(2,"0")}-${String(n.getUTCDate()).padStart(2,"0")}`}function pe(e,t,n,a){let r=Number(n.slice(0,4)),o=[],i=[r-100,r-1,r,r+1,r+100];for(let s of i){let l=new Date(Date.UTC(s,1,29)).getUTCDate()===29?366:365;for(let g=0;g<l;g+=1){let m=a(Ge(s,g));m?.isValid()&&m.format(t)===e&&o.push(m)}}return o}function Xe(e,t,n,a){let r=n.format("YYYY-MM-DD");return pe(e,t,r,a).some(i=>i.format("YYYY-MM-DD")!==r)}function fe(e,t,n,a,r,o){if(!t||t!==e||t.path!==e.path||t.basename!==e.basename)throw new c("The active Daily Note changed, moved, or was deleted; import aborted before writing.");if((n.folder??"")!==(a.folder??"")||(n.format??"")!==(a.format??"")||(n.template??"")!==(a.template??"")||r!==o)throw new c("The active Daily Note or core Daily Notes configuration changed; import aborted before writing.")}function me(e,t,n,a){if(n===0)return`No Calendar events found for ${e}. The active Daily Note was updated.`;let r=n===1?"event":"events";return a===0?`Imported ${n} Calendar ${r} into ${t}. No attendees or event titles uniquely matched vault notes.`:`Imported ${n} Calendar ${r} into ${t} and added ${a} vault ${a===1?"link":"links"}.`}var $=class extends f.Plugin{constructor(){super(...arguments);this.settings={...E};this.excludedVaultFoldersPersistedInvalid=!1}async onload(){await this.loadSettings(),this.addCommand({id:"import-calendar-events-into-active-daily-note",name:"Import Calendar events into active Daily Note",callback:()=>{this.importIntoActiveDailyNote()}}),this.addSettingTab(new Q(this.app,this))}async loadSettings(){let n=await this.loadData(),a=ge(n?.excludedVaultFolders);this.excludedVaultFoldersPersistedInvalid=a.malformed,this.excludedVaultFoldersInput=a.rawInput,this.settings={excludedVaultFolders:a.folders,sectionHeading:B(n?.sectionHeading)}}async saveSettings(){this.settings.excludedVaultFolders=ue(this.settings.excludedVaultFolders),this.settings.sectionHeading=B(this.settings.sectionHeading);let n=this.excludedVaultFoldersPersistedInvalid?{...this.settings,excludedVaultFolders:this.excludedVaultFoldersInput??""}:this.settings;await this.saveData(n)}async importIntoActiveDailyNote(){let n=new f.Notice("Checking the active Daily Note\u2026",0),a=r=>{n.setMessage(r),window.setTimeout(()=>n.hide(),1e4)};try{if(process.platform!=="darwin")throw new Error("Calendar Daily Note Linker requires macOS desktop and Calendar.app.");P(this.app);let r=this.app.workspace.getActiveFile();if(!r||r.extension.toLowerCase()!=="md")throw new c("Open an existing core Daily Note before running this command.");P(this.app);let o=M();if(!o)throw new Error("Daily Notes settings are unavailable.");P(this.app);let i=(u,we)=>window.moment(u,we,!0),s=u=>window.moment(u,"YYYY-MM-DD",!0),l=j(r,o,i,u=>R(u,"day"),s);if(this.excludedVaultFoldersPersistedInvalid)throw new Error("Saved vault folder exclusions are invalid. Correct them in settings before importing Calendar events.");n.setMessage(`Reading Calendar for ${l}\u2026`);let g=await ee(l);g.warnings.length&&new f.Notice(`Calendar warning: ${g.warnings.join(" ")}`,8e3),n.setMessage("Matching vault notes\u2026");let m=this.app.vault.getMarkdownFiles().map(u=>({path:u.path,basename:u.basename,file:u,frontmatter:this.app.metadataCache.getFileCache(u)?.frontmatter})),h=ae(ne(m,this.settings.excludedVaultFolders),u=>{if(!u.file)throw new Error(`Vault note is unavailable: ${u.path}`);return this.app.fileManager.generateMarkdownLink(u.file,r.path,void 0,u.basename||void 0)}),D=ce(g,this.settings.sectionHeading,h);n.setMessage("Writing the active Daily Note\u2026"),P(this.app);let V=this.app.workspace.getActiveFile();if(!V||this.app.vault.getAbstractFileByPath(r.path)!==r)throw new c("The active Daily Note changed, moved, or was deleted; import aborted before writing.");P(this.app);let L=M();if(!L)throw new c("Core Daily Notes settings changed; import aborted before writing.");P(this.app);let he=j(V,L,i,u=>R(u,"day"),s);fe(r,V,o,L,l,he),await this.app.vault.process(r,u=>se(u,D.block)),a(me(l,r.basename,D.eventCount,D.linkCount))}catch(r){let o=r instanceof w||r instanceof A||r instanceof c?r.message:`Could not import Calendar events: ${r instanceof Error?r.message:String(r)}`;a(o)}}},Q=class extends f.PluginSettingTab{constructor(t,n){super(t,n),this.plugin=n}display(){let{containerEl:t}=this;t.empty(),t.createEl("h2",{text:"Calendar Daily Note Linker"}),this.plugin.excludedVaultFoldersPersistedInvalid&&t.createEl("p",{text:"Saved vault folder exclusions are invalid; correct them before importing Calendar events."}),new f.Setting(t).setName("Vault folders to exclude").setDesc("Optional vault-relative folders to skip when matching Calendar attendees; one path per line; exclusions include subfolders; blank searches all Markdown notes.").addTextArea(n=>{n.setPlaceholder(`Archive
Templates
Private/People`).setValue(this.plugin.excludedVaultFoldersInput??this.plugin.settings.excludedVaultFolders.join(`
`)),n.inputEl.addEventListener("blur",()=>{this.commitExcludedVaultFolders(n)})}),new f.Setting(t).setName("Section heading").setDesc("Markdown heading used inside the managed Calendar section; saves when focus leaves the field (for example ## Calendar).").addText(n=>{n.setPlaceholder(E.sectionHeading).setValue(this.plugin.settings.sectionHeading),n.inputEl.addEventListener("blur",()=>{this.commitSectionHeading(n)})}),t.createEl("p",{text:"Open an existing core Daily Note, then run the command; it updates that open note for its date."})}async commitSectionHeading(t){let n=this.plugin.settings.sectionHeading,a=q(t.getValue());if(!a){t.setValue(n),new f.Notice("Use a Markdown heading from # to ######, such as ## Calendar.");return}this.plugin.settings.sectionHeading=a,t.setValue(a);try{await this.plugin.saveSettings()}catch(r){this.plugin.settings.sectionHeading=n,t.setValue(n),new f.Notice(`Could not save the Section heading: ${r instanceof Error?r.message:String(r)}`)}}async commitExcludedVaultFolders(t){let n=[...this.plugin.settings.excludedVaultFolders],a=this.plugin.excludedVaultFoldersPersistedInvalid,r=this.plugin.excludedVaultFoldersInput,o=I(t.getValue());if(!o){this.plugin.excludedVaultFoldersPersistedInvalid||t.setValue(n.join(`
`)),new f.Notice("Use one safe vault-relative folder per line, or leave the field blank.");return}this.plugin.settings.excludedVaultFolders=o,this.plugin.excludedVaultFoldersPersistedInvalid=!1,this.plugin.excludedVaultFoldersInput=void 0,t.setValue(o.join(`
`));try{await this.plugin.saveSettings()}catch(i){this.plugin.settings.excludedVaultFolders=n,this.plugin.excludedVaultFoldersPersistedInvalid=a,this.plugin.excludedVaultFoldersInput=r,t.setValue(a?r??"":n.join(`
`)),new f.Notice(`Could not save excluded folders: ${i instanceof Error?i.message:String(i)}`)}}};
