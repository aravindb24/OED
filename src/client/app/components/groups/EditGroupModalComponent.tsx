/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
// TODO import store from '../../index';
// Realize that * is already imported from react
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { State } from 'types/redux/state';
import { Modal, Button } from 'react-bootstrap';
import { Input } from 'reactstrap';
import { FormattedMessage } from 'react-intl';
import translate from '../../utils/translate';
import TooltipMarkerComponent from '../TooltipMarkerComponent';
import TooltipHelpContainer from '../../containers/TooltipHelpContainer';
import ListDisplayComponent from '../ListDisplayComponent';
import '../../styles/modal.css';
import '../../styles/card-page.css';
import { removeUnsavedChanges } from '../../actions/unsavedWarning';
import { submitGroupEdits, fetchGroupChildrenIfNeeded } from '../../actions/groups'; // TODO verify correct action, remove export for action if not used.
import { GroupDefinition } from '../../types/redux/groups'; // TODO correct one?
import { TrueFalseType } from '../../types/items';
import { NamedIDItem } from '../../types/items';
import { isRoleAdmin } from '../../utils/hasPermissions';
import { GPSPoint, isValidGPSInput } from '../../utils/calibration';
import { notifyUser, getGPSString } from '../../utils/input'

interface EditGroupModalComponentProps {
	show: boolean;
	group: GroupDefinition;
	// passed in to handle closing the modal
	handleClose: () => void;
}

export default function EditGroupModalComponent(props: EditGroupModalComponentProps) {
	const dispatch = useDispatch();

	// Meter state
	const metersState = useSelector((state: State) => state.meters.byMeterID);
	// Group state
	const groupsState = useSelector((state: State) => state.groups.byGroupID);

	// Check for admin status
	const currentUser = useSelector((state: State) => state.currentUser.profile);
	const loggedInAsAdmin = (currentUser !== null) && isRoleAdmin(currentUser.role);

	// Set existing group values
	const values = {
		name: props.group.name,
		// childMeters: props.group.childMeters,
		// TODO childGroups: props.group.childGroups,
		displayable: props.group.displayable,
		gps: props.group.gps,
		note: props.group.note,
		area: props.group.area,
		defaultGraphicUnit: props.group.defaultGraphicUnit,
		id: props.group.id,
	}

	// The information on the children of this group
	const groupChildrenDefaults = {
		// The identifiers of all direct meter children that are visible to this user.
		childMetersIdentifier: [] as string[],
		// The original number of direct meter children
		childMetersTrueSize: 0,
		// The names of all direct meter children that are visible to this user.
		childGroupsName: [] as string[],
		// The original number of direct group children
		childGroupsTrueSize: 0,
		// The identifiers of all meter children (deep meters) that are visible to this user.
		deepMetersIdentifier: [] as string[],
		// The original number of direct meter children
		deepMetersTrueSize: 0,
	}

	/* State */
	// Handlers for each type of input change
	const [state, setState] = useState(values);

	const handleStringChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setState({ ...state, [e.target.name]: e.target.value });
	}

	const handleBooleanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setState({ ...state, [e.target.name]: JSON.parse(e.target.value) });
	}

	const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setState({ ...state, [e.target.name]: Number(e.target.value) });
	}

	const [groupChildrenState, setGroupChildrenState] = useState(groupChildrenDefaults)
	/* End State */

	// Reset the state to default values
	// To be used for the discard changes button
	// Different use case from CreateGroupModalComponent's resetState
	// This allows us to reset our state to match the store in the event of an edit failure
	// Failure to edit groups will not trigger a re-render, as no state has changed. Therefore, we must manually reset the values
	const resetState = () => {
		setState(values);
	}

	const handleClose = () => {
		props.handleClose();
		resetState();
	}

	//TODO change this comment
	// Validate the changes and return true if we should update this group.
	// Two reasons for not updating the group:
	//	1. typeOfUnit is changed from meter to something else while some meters are still linked with this unit
	//	2. There are no changes
	//  3. TODO ask Steve about Logic here
	const shouldUpdateGroup = (): boolean => {
		//TODO changed to match values in group
		//TODO need to add children values
		return props.group.name != state.name
			|| props.group.displayable != state.displayable
			|| props.group.gps != state.gps
			|| props.group.note != state.note
			|| props.group.area != state.area
			|| props.group.defaultGraphicUnit != state.defaultGraphicUnit
			|| props.group.id != state.id;
	}

	// Save changes
	// Currently using the old functionality which is to compare inherited prop values to state values
	// If there is a difference between props and state, then a change was made
	// Side note, we could probably just set a boolean when any input
	const handleSaveChanges = () => {
		// Close the modal first to avoid repeat clicks
		setState(values);

		let inputOk = true;

		//Check if area is positive
		//TODO object is possibly undefined
		if (state.area < 0) {
			notifyUser(translate('area.invalid') + state.area + '.');
			inputOk = false;
		}

		//Check default graphic unit
		if (state.defaultGraphicUnit === -999) {
			notifyUser(translate('group.graphic.invalid'));
			inputOk = false;
		}

		//Check GPS
		const gpsInput = state.gps;
		let gps: GPSPoint | null = null;
		const latitudeIndex = 0;
		const longitudeIndex = 1;

		//if the user input a value then gpsInput should be a string
		// null came from DB and it is okay to just leave it - Not a String.
		if (typeof gpsInput === 'string') {
			if (isValidGPSInput(gpsInput)) {
				//Clearly gpsInput is a string but TS complains about the split so cast.
				const gpsValues = (gpsInput as string).split(',').map((value: string) => parseFloat(value));
				//It is valid and needs to be in this format for routing
				gps = {
					longitude: gpsValues[longitudeIndex],
					latitude: gpsValues[latitudeIndex]
				};
			} else if ((gpsInput as string).length !== 0) {
				notifyUser(translate('input.gps.range') + state.gps + '.');
				inputOk = false;
			}
		}

		if (inputOk) {
			// TODO const submitState = { ...state, gps: gps };
			resetState();
		} else {
			notifyUser(translate('group.input.error'));
		}

		// TODO should we close if there was an error?
		props.handleClose();

		if (shouldUpdateGroup()) {
			// TODO dispatch(submitGroupEdits(state));
			dispatch(removeUnsavedChanges());
		}
	}

	// Determine the names of the child meters/groups.
	React.useEffect(() => {
		// Get the children of this meter. This will happen twice on the first load.
		// TODO Since this is done for each card, it would be better to load them all at once
		// rather per meter. This means moving this into the GroupsDetailComponent or before.
		// TODO I think this function will fetch as long as another is not fetching so it could be made better
		// to avoid redoing when not needed.
		// TODO Look into outdated on group state to see how used and if needed with new group pages.
		dispatch(fetchGroupChildrenIfNeeded(state.id));
		// State for current group
		const currentGroup = groupsState[state.id];

		// Information to display the direct children meters.
		// Holds the names of all direct meter children of this group when visible to this user.
		const childMetersIdentifier: string[] = [];
		currentGroup.childMeters.forEach((meterID: number) => {
				// Make sure meter state exists. Also, the identifier is missing if not visible (non-admin).
			if (metersState[meterID] !== undefined && metersState[meterID].identifier !== null) {
				childMetersIdentifier.push(metersState[meterID].identifier.trim());
			}
		});
		childMetersIdentifier.sort();
		// Record the total number so later can compare the number in array to see if any missing.
		const trueMeterSize = currentGroup.childMeters.length;

		// Information to display the direct children groups.
		// Holds the names of all direct group children of this group when visible to this user.
		const childGroupsName: string[] = [];
		currentGroup.childGroups.forEach((groupID: number) => {
				// Make sure group state exists. Also, the name is missing if not visible (non-admin).
			if (groupsState[groupID] !== undefined && groupsState[groupID].name !== null) {
				childGroupsName.push(groupsState[groupID].name.trim());
			}
		});
		childGroupsName.sort();
		// Record the total number so later can compare the number in array to see if any missing.
		const trueGroupSize = currentGroup.childGroups.length;

		// Information to display all (deep) children meters.
		// Holds the names of all (deep) meter children of this group when visible to this user.
		const deepMetersIdentifier: string[] = [];
		currentGroup.deepMeters.forEach((meterID: number) => {
				// Make sure meter state exists. Also, the identifier is missing if not visible (non-admin).
			if (metersState[meterID] !== undefined && metersState[meterID].identifier !== null) {
				deepMetersIdentifier.push(metersState[meterID].identifier.trim());
			}
		});
		deepMetersIdentifier.sort();
		// Record the total number so later can compare the number in array to see if any missing.
		const trueDeepMeterSize = currentGroup.deepMeters.length;
		
		// Update the state
		setGroupChildrenState({
			...groupChildrenState,
			childMetersIdentifier: childMetersIdentifier,
			childMetersTrueSize: trueMeterSize,
			childGroupsName: childGroupsName,
			childGroupsTrueSize: trueGroupSize,
			deepMetersIdentifier: deepMetersIdentifier,
			deepMetersTrueSize: trueDeepMeterSize
		})
	}, [metersState, groupsState[state.id].childMeters, groupsState[state.id].childGroups, groupsState[state.id].deepMeters]);

	const tooltipStyle = {
		display: 'inline-block',
		fontSize: '60%',
		// Switch help depending if admin or not.
		tooltipEditGroupView: loggedInAsAdmin ? 'help.admin.groupedit' : 'help.groups.groupdetails'
	};

	const formInputStyle: React.CSSProperties = {
		paddingBottom: '5px'
	}

	const tableStyle: React.CSSProperties = {
		width: '100%'
	};

	return (
		<>
			<Modal show={props.show} onHide={props.handleClose}>
				<Modal.Header>
					<Modal.Title> <FormattedMessage id={loggedInAsAdmin ? "edit.group" : "group.details"} />
						<TooltipHelpContainer page='groups' />
						<div style={tooltipStyle}>
							<TooltipMarkerComponent page='groups' helpTextId={tooltipStyle.tooltipEditGroupView} />
						</div>
					</Modal.Title>
				</Modal.Header>
				{/* when any of the group are changed call one of the functions (if admin). */}
				<Modal.Body className="show-grid">
					<div id="container">
						<div id="modalChild">
							{/* Modal content */}
							<div className="container-fluid">
								<div style={tableStyle}>
									{/* Name where input if admin or shown if now */}
									{loggedInAsAdmin ?
										<div style={formInputStyle}>
											<label><FormattedMessage id="group.name" /></label><br />
											<Input
												name='name'
												type='text'
												onChange={e => handleStringChange(e)}
												value={state.name} />
										</div>
										:
										<div className="item-container">
											<b><FormattedMessage id="group.name" /></b> {state.name}
										</div>
									}
									{/* default graphic unit input */}
									{loggedInAsAdmin ?
										< div style={formInputStyle}>
											<label><FormattedMessage id="group.defaultGraphicUnit" /></label><br />
											<Input
												name='defaultGraphicUnit'
												type='select'
												value={state.defaultGraphicUnit}
												onChange={e => handleNumberChange(e)}>
												{<option
													value={-999}
													key={-999}
													hidden={state.defaultGraphicUnit !== -999}
													disabled>
													{translate('select.unit')}
												</option>}
												{/* TODO {Array.from(dropdownsState.compatibleGraphicUnits).map(unit => {
													return (<option value={unit.id} key={unit.id}>{unit.identifier}</option>)
												})}
												{Array.from(dropdownsState.incompatibleGraphicUnits).map(unit => {
													return (<option value={unit.id} key={unit.id} disabled>{unit.identifier}</option>)
												})} */}
											</Input>
										</div>
										:
										<div className="item-container">
											{/* Use meter translation id string since same one wanted. */}
											<b><FormattedMessage id="meter.defaultGraphicUnit" /></b> {props.group.defaultGraphicUnit}
										</div>
									}
									{/* Displayable input */}
									{loggedInAsAdmin && // only render when logged in as Admin
										<div style={formInputStyle}>
											<label><FormattedMessage id="group.displayable" /></label><br />
											<Input
												name='displayable'
												type='select'
												value={state.displayable.toString()}
												onChange={e => handleBooleanChange(e)}>
												{Object.keys(TrueFalseType).map(key => {
													return (<option value={key} key={key}>{translate(`TrueFalseType.${key}`)}</option>)
												})}
											</Input>
										</div>
									}
									{/* Area input */}
									{loggedInAsAdmin && // only render when logged in as Admin
										<div style={formInputStyle}>
											<label><FormattedMessage id="group.area" /></label><br />
											<Input
												name="area"
												type="number"
												step="0.01"
												min="0"
												value={state.area}
												onChange={e => handleNumberChange(e)} />
										</div>
									}
									{/* GPS input */}
									{loggedInAsAdmin && // only render when logged in as Admin
										<div style={formInputStyle}>
											<label><FormattedMessage id="group.gps" /></label><br />
											<Input
												name='gps'
												type='text'
												onChange={e => handleStringChange(e)}
												value={getGPSString(state.gps)} />
										</div>
									}
									{/* Note input */}
									{loggedInAsAdmin && // only render when logged in as Admin
										<div style={formInputStyle}>
											<label><FormattedMessage id="group.note" /></label><br />
											<Input
												name='note'
												type='textarea'
												onChange={e => handleStringChange(e)}
												value={state.note} />
										</div>
									}
									{/* The child meters in this group */}
									<div>
										<b><FormattedMessage id='child.meters' /></b>:
										<ListDisplayComponent trueSize={groupChildrenState.childMetersTrueSize} items={groupChildrenState.childMetersIdentifier} />
									</div>
									{/* The child groups in this group */}
									<div>
										<b><FormattedMessage id='child.groups' /></b>:
										<ListDisplayComponent trueSize={groupChildrenState.childGroupsTrueSize} items={groupChildrenState.childGroupsName} />
									</div>
										{/* All (deep) meters in this group */}
										<div>
										<b><FormattedMessage id='group.all.meters' /></b>:
										<ListDisplayComponent trueSize={groupChildrenState.deepMetersTrueSize} items={groupChildrenState.deepMetersIdentifier} />
									</div>
								</div>
							</div>
						</div>
					</div>
				</Modal.Body>
				<Modal.Footer>
					{/* Discard & save buttons if admin and close button if not. */}
					{loggedInAsAdmin ?
						// Hides the modal
						<div>
							<Button variant="secondary" onClick={handleClose}>
								<FormattedMessage id="discard.changes" />
							</Button>
							{/* On click calls the function handleSaveChanges in this component */}
							<Button variant="primary" onClick={handleSaveChanges} disabled={!state.name}>
								<FormattedMessage id="save.all" />
							</Button>
						</div>
						:
						<Button onClick={handleClose}>
							<FormattedMessage id="close" />
						</Button>
					}
				</Modal.Footer>
			</Modal >
		</>
	);
}