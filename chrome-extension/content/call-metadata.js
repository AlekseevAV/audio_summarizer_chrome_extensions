import { panelIframe } from "./state.js";
import { log, debug } from "./logger.js";
import { MESSAGE_SOURCES, MESSAGE_TYPES } from "../shared/message-types.js";

// Get the meeting details from the DOM
export async function meetingDetailsFromDOM() {
  let title, description, time, location;
  const scheduleNode = Array.from(document.querySelectorAll("i")).find(
    (el) => el.textContent == "schedule",
  );
  if (scheduleNode) {
    let titleNode, descriptionNode, timeNode, locationNode;
    const detailsNode = scheduleNode.parentNode.parentNode;
    detailsNode.querySelectorAll(":scope > div").forEach((el) => {
      if (el.role == "heading") {
        titleNode = el.querySelector("div[role='tooltip']");
      } else if (el.textContent.includes("schedule")) {
        timeNode = el.querySelector("div");
      } else if (el.textContent.includes("room")) {
        locationNode = el.querySelector("div");
      } else {
        descriptionNode = el;
      }
    });
    title = titleNode?.textContent;
    description = descriptionNode?.textContent;
    time = timeNode?.textContent;
    location = locationNode?.textContent;
  } else {
    debug("Schedule node not found.");
  }
  return { title, description, time, location };
}

// Get meeting participants from the DOM
export async function meetingParticipantsFromDOM() {
  const participants = [];

  // Get the call participants (in meeting)
  document
    .querySelectorAll('div[aria-label="Participants"] div[role="listitem"]')
    .forEach((el) => {
      participants.push({ name: el.ariaLabel });
    });

  // Get the call participants (not joined yet)
  document
    .querySelectorAll('div[aria-label="Guests"] div[role="listitem"]')
    .forEach((el) => {
      participants.push({ name: el.ariaLabel });
    });

  return participants;
}

// Parse time string
// "Sat, Apr 12, 2025 9:45 PM - 10:30 PM":
//   * timeStart = Date("2025-04-12T21:45:00")
//   * timeEnd = Date("2025-04-12T22:30:00")
export function parseTimeRange(timeString) {
  // Check if the time string is in the expected format
  const timeRegex =
    /^(?:\w{3}, )?\w{3} \d{1,2}, \d{4} \d{1,2}:\d{2}\s?[AP]M - \d{1,2}:\d{2}\s?[AP]M$/;
  if (!timeRegex.test(timeString)) {
    debug("Invalid time format:", timeString);
    return { startDate: new Date(), endDate: new Date() };
  }

  // split by date and time range
  const [datePart, timeRangePart] = timeString.split(/(?<=\d{4})\s/);
  const [startTime, endTime] = timeRangePart.split(" - ");

  const startDate = new Date(`${datePart} ${startTime}`);
  const endDate = new Date(`${datePart} ${endTime}`);

  return { startDate, endDate };
}

// Gather all call metadata
export async function gatherCallMetadata() {
  const callMetadata = {
    title: null,
    description: null,
    time: null,
    location: null,
    participants: [],
  };

  // Meeting details
  const meetingDetails = await meetingDetailsFromDOM();
  callMetadata.title = meetingDetails.title;
  callMetadata.description = meetingDetails.description;
  callMetadata.time = meetingDetails.time;
  callMetadata.location = meetingDetails.location;

  // Parse the time range
  if (callMetadata.time) {
    const { startDate, endDate } = parseTimeRange(callMetadata.time);
    callMetadata.timeStart = startDate;
    callMetadata.timeEnd = endDate;
  }

  // Get the call participants
  const callParticipants = await meetingParticipantsFromDOM();
  callMetadata.participants = callParticipants;

  log("gatherCallMetadata result:", callMetadata);
  return callMetadata;
}

// Update and send call metadata to panel
export async function updateCallMetadata() {
  let callMetadata = await gatherCallMetadata();
  log("Sending call metadata to panel:", callMetadata);
  // Send the call metadata to the transcription panel
  if (panelIframe?.contentWindow) {
    panelIframe.contentWindow.postMessage(
      {
        source: MESSAGE_SOURCES.CONTENT,
        type: MESSAGE_TYPES.CALL_METADATA,
        data: callMetadata,
      },
      "*",
    );
  }
}
